import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

const CATEGORIES = ["Fiction", "Science", "History", "Kids", "Others"];
const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title: { title: 1 },
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res) => {
  try {
    const { search, category, sort, limit } = req.query;
    const filter = {};

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), "i");
      filter.$or = [{ title: pattern }, { author: pattern }];
    }

    if (category) {
      filter.category = String(category);
    }

    const db = await getDb();
    let cursor = db
      .collection("books")
      .find(filter)
      .sort(SORTS[String(sort)] || SORTS.newest);

    const parsedLimit = Number.parseInt(limit, 10);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      cursor = cursor.limit(parsedLimit);
    }

    const books = await cursor.toArray();
    return res.json(books);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch books" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const body = req.body || {};
    const { title, author, category, image, description, totalCopies } = body;

    if (
      !title ||
      !author ||
      !category ||
      totalCopies === undefined ||
      totalCopies === null
    ) {
      return res.status(400).json({
        message: "title, author, category and totalCopies are required",
      });
    }

    if (typeof title !== "string" || typeof author !== "string") {
      return res.status(400).json({ message: "title and author must be strings" });
    }

    if (!CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ message: `category must be one of ${CATEGORIES.join(", ")}` });
    }

    const copies = Number(totalCopies);
    if (!Number.isInteger(copies) || copies <= 0) {
      return res
        .status(400)
        .json({ message: "totalCopies must be a positive integer" });
    }

    const book = {
      title: title.trim(),
      author: author.trim(),
      category,
      image: typeof image === "string" ? image : "",
      description: typeof description === "string" ? description : "",
      totalCopies: copies,
      availableCopies: copies,
      addedBy: { name: req.user.name, email: req.user.email },
      createdAt: new Date(),
    };

    const db = await getDb();
    const result = await db.collection("books").insertOne(book);

    return res.status(201).json({ ...book, _id: result.insertedId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to add book" });
  }
});

router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const db = await getDb();
    const book = await db
      .collection("books")
      .findOne({ _id: new ObjectId(id) });

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    return res.json(book);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch book" });
  }
});

export default router;
