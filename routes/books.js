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

export default router;
