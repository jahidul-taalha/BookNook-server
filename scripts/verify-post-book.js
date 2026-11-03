import "../env.js";
import { getJwtSecret } from "../env.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5111;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
      // Not ready yet.
    }
    await sleep(250);
  }
  throw new Error(`Server did not start.\n${logs.join("")}`);
}

const secret = getJwtSecret();
if (!secret) {
  throw new Error("JWT_SECRET is missing from .env");
}

const token = await new SignJWT({
  email: "verify-post-book@test.local",
  name: "Verify User",
})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("verify-post-book@test.local")
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));

const logs = [];
const child = spawn(process.execPath, ["index.js"], {
  cwd: rootDir,
  env: { ...process.env, PORT: String(PORT), VERCEL: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (data) => logs.push(String(data)));
child.stderr.on("data", (data) => logs.push(String(data)));

try {
  await waitForServer(child, logs);

  const response = await fetch(`${BASE_URL}/books`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Verify POST /books",
      author: "Verify Author",
      category: "Fiction",
      totalCopies: 1,
    }),
  });

  const body = await response.json().catch(() => null);
  console.log(`POST /books status: ${response.status}`);
  console.log(`message: ${body?.message || "created"}`);

  if (response.status === 201 && body?._id) {
    await fetch(`${BASE_URL}/books/${body._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Verified: token from .env JWT_SECRET is accepted.");
  } else {
    process.exitCode = 1;
  }
} finally {
  child.kill();
}
