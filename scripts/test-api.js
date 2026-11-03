import "dotenv/config";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { MongoClient } from "mongodb";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEST_PORT) || 5099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECRET = randomBytes(32).toString("hex");
const TEST_DB = process.env.TEST_DB_NAME || "booknook_api_test";
const RUN_ID = Date.now().toString(36);
const EMAIL_A = `owner-${RUN_ID}@test.local`;
const EMAIL_B = `other-${RUN_ID}@test.local`;

const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

async function makeToken(email, name) {
  return new SignJWT({ email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

async function request(method, route, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, text, json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early.\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/`);
      if (response.ok) return;
    } catch {
      // Server not ready yet.
    }
    await sleep(250);
  }
  throw new Error(`Server did not start.\n${logs.join("")}`);
}

async function main() {
  const tokenA = await makeToken(EMAIL_A, "Owner User");
  const tokenB = await makeToken(EMAIL_B, "Other User");
  const logs = [];
  const createdBookIds = [];

  const child = spawn(process.execPath, ["index.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: SECRET,
      DB_NAME: TEST_DB,
      VERCEL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => logs.push(String(data)));
  child.stderr.on("data", (data) => logs.push(String(data)));

  let dbClient;

  try {
    await waitForServer(child, logs);

    const health = await request("GET", "/");
    check("GET / health", health.status === 200 && health.text.includes("running"));

    const preflight = await fetch(`${BASE_URL}/books`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    check(
      "CORS preflight allows localhost:3000 and Authorization",
      preflight.status === 204 &&
        preflight.headers.get("access-control-allow-origin") ===
          "http://localhost:3000" &&
        String(preflight.headers.get("access-control-allow-headers"))
          .toLowerCase()
          .includes("authorization")
    );

    const noToken = await request("GET", "/books/000000000000000000000000");
    check("GET /books/:id without token -> 401", noToken.status === 401);

    const noTokenPost = await request("POST", "/books", {
      body: { title: "No token" },
    });
    check("POST /books without token -> 401", noTokenPost.status === 401);

    const createBook = await request("POST", "/books", {
      token: tokenA,
      body: {
        title: `Book ${RUN_ID}`,
        author: "Test Author",
        category: "Fiction",
        image: "cover.jpg",
        description: "A test book",
        totalCopies: 2,
        addedBy: { name: "Hacker", email: "hacker@test.local" },
      },
    });
    check("POST /books -> 201", createBook.status === 201, String(createBook.status));
    const bookId = createBook.json?._id;
    if (bookId) createdBookIds.push(bookId);
    check(
      "POST /books uses token owner",
      createBook.json?.addedBy?.email === EMAIL_A &&
        createBook.json?.addedBy?.name === "Owner User"
    );

    const listBooks = await request(
      "GET",
      `/books?search=${encodeURIComponent(`book ${RUN_ID}`)}&category=Fiction&sort=title&limit=10`
    );
    check(
      "GET /books filters and finds book",
      listBooks.status === 200 && listBooks.json?.some((book) => book._id === bookId)
    );

    const getBook = await request("GET", `/books/${bookId}`, { token: tokenA });
    check("GET /books/:id -> 200", getBook.status === 200 && getBook.json?._id === bookId);

    const invalidId = await request("GET", "/books/not-an-id", { token: tokenA });
    check("GET /books/:id invalid id -> 400", invalidId.status === 400);

    const updateBook = await request("PATCH", `/books/${bookId}`, {
      token: tokenA,
      body: { totalCopies: 4, title: `Book ${RUN_ID} updated` },
    });
    check(
      "PATCH /books/:id adjusts availableCopies",
      updateBook.status === 200 &&
        updateBook.json?.totalCopies === 4 &&
        updateBook.json?.availableCopies === 4
    );

    const wrongOwnerPatch = await request("PATCH", `/books/${bookId}`, {
      token: tokenB,
      body: { title: "Hijacked" },
    });
    check("PATCH /books/:id wrong owner -> 403", wrongOwnerPatch.status === 403);

    const borrow = await request("POST", "/borrows", {
      token: tokenA,
      body: { bookId },
    });
    check("POST /borrows -> 201", borrow.status === 201, String(borrow.status));
    const borrowId = borrow.json?._id;
    const borrowDays =
      borrow.json?.returnDate && borrow.json?.borrowDate
        ? Math.round(
            (new Date(borrow.json.returnDate) - new Date(borrow.json.borrowDate)) /
              (24 * 60 * 60 * 1000)
          )
        : null;
    check("POST /borrows sets 7 day return date", borrowDays === 7, String(borrowDays));

    const afterBorrow = await request("GET", `/books/${bookId}`, { token: tokenA });
    check("Borrow decrements availableCopies", afterBorrow.json?.availableCopies === 3);

    const doubleBorrow = await request("POST", "/borrows", {
      token: tokenA,
      body: { bookId },
    });
    check(
      "Double borrow -> 409",
      doubleBorrow.status === 409 &&
        doubleBorrow.json?.message === "You have already borrowed this book"
    );

    const createZeroCopyBook = await request("POST", "/books", {
      token: tokenA,
      body: {
        title: `Zero Book ${RUN_ID}`,
        author: "Test Author",
        category: "Kids",
        totalCopies: 1,
      },
    });
    const zeroBookId = createZeroCopyBook.json?._id;
    if (zeroBookId) createdBookIds.push(zeroBookId);

    const borrowZeroBook = await request("POST", "/borrows", {
      token: tokenA,
      body: { bookId: zeroBookId },
    });
    check("Borrow last copy -> 201", borrowZeroBook.status === 201);

    const borrowUnavailable = await request("POST", "/borrows", {
      token: tokenB,
      body: { bookId: zeroBookId },
    });
    check(
      "Borrow with 0 copies -> 400",
      borrowUnavailable.status === 400 &&
        borrowUnavailable.json?.message === "This book is not available right now"
    );

    const listBorrows = await request("GET", "/borrows", { token: tokenA });
    check(
      "GET /borrows returns only token user's borrows",
      listBorrows.status === 200 &&
        listBorrows.json?.length >= 2 &&
        listBorrows.json?.every((item) => item.userEmail === EMAIL_A)
    );

    const wrongOwnerReturn = await request("DELETE", `/borrows/${borrowId}`, {
      token: tokenB,
    });
    check("DELETE /borrows/:id wrong owner -> 403", wrongOwnerReturn.status === 403);

    const returnBook = await request("DELETE", `/borrows/${borrowId}`, {
      token: tokenA,
    });
    check("DELETE /borrows/:id -> 200", returnBook.status === 200);

    const afterReturn = await request("GET", `/books/${bookId}`, { token: tokenA });
    check("Return increments availableCopies", afterReturn.json?.availableCopies === 4);

    const wrongOwnerDelete = await request("DELETE", `/books/${bookId}`, {
      token: tokenB,
    });
    check("DELETE /books/:id wrong owner -> 403", wrongOwnerDelete.status === 403);

    const deleteBook = await request("DELETE", `/books/${bookId}`, {
      token: tokenA,
    });
    check("DELETE /books/:id -> 200", deleteBook.status === 200);

    const deletedBook = await request("GET", `/books/${bookId}`, { token: tokenA });
    check("Deleted book -> 404", deletedBook.status === 404);

    const deleteRemainingBook = await request("DELETE", `/books/${zeroBookId}`, {
      token: tokenA,
    });
    check("DELETE /books/:id with borrows -> 200", deleteRemainingBook.status === 200);

    dbClient = new MongoClient(process.env.MONGODB_URI);
    await dbClient.connect();
    const testDb = dbClient.db(TEST_DB);
    const indexInfo = await testDb.collection("borrows").indexes();
    check(
      "Unique borrow index exists",
      indexInfo.some((index) => index.unique && index.key.bookId && index.key.userEmail)
    );
  } finally {
    if (dbClient) {
      const testDb = dbClient.db(TEST_DB);
      await testDb.collection("books").deleteMany({ title: { $regex: RUN_ID } });
      await testDb
        .collection("borrows")
        .deleteMany({ userEmail: { $in: [EMAIL_A, EMAIL_B] } });
      await dbClient.close();
    } else if (process.env.MONGODB_URI) {
      const cleanup = new MongoClient(process.env.MONGODB_URI);
      await cleanup.connect();
      const testDb = cleanup.db(TEST_DB);
      await testDb.collection("books").deleteMany({ title: { $regex: RUN_ID } });
      await testDb
        .collection("borrows")
        .deleteMany({ userEmail: { $in: [EMAIL_A, EMAIL_B] } });
      await cleanup.close();
    }

    child.kill();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
