import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

router.post("/", verifyToken, async (req, res) => {
  try {
    const { bookId } = req.body || {};
    if (typeof bookId !== "string" || !ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "A valid bookId is required" });
    }

    const db = await getDb();
    const books = db.collection("books");
    const borrows = db.collection("borrows");
    const _id = new ObjectId(bookId);

    const book = await books.findOne({ _id });
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const alreadyBorrowed = await borrows.findOne({
      bookId: _id,
      userEmail: req.user.email,
    });
    if (alreadyBorrowed) {
      return res
        .status(409)
        .json({ message: "You have already borrowed this book" });
    }

    const updatedBook = await books.findOneAndUpdate(
      { _id, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { returnDocument: "after" }
    );

    const bookAfter = updatedBook?.value ?? updatedBook;
    if (!bookAfter) {
      return res
        .status(400)
        .json({ message: "This book is not available right now" });
    }

    const now = new Date();
    const borrow = {
      bookId: _id,
      bookTitle: book.title,
      bookImage: book.image || "",
      userName: req.user.name,
      userEmail: req.user.email,
      borrowDate: now,
      returnDate: new Date(now.getTime() + SEVEN_DAYS_MS),
    };

    try {
      const result = await borrows.insertOne(borrow);
      return res.status(201).json({ ...borrow, _id: result.insertedId });
    } catch (insertError) {
      await books.updateOne({ _id }, { $inc: { availableCopies: 1 } });

      if (insertError?.code === 11000) {
        return res
          .status(409)
          .json({ message: "You have already borrowed this book" });
      }

      return res.status(500).json({ message: "Failed to borrow book" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Failed to borrow book" });
  }
});

router.get("/", verifyToken, async (req, res) => {
  try {
    const db = await getDb();
    const borrows = await db
      .collection("borrows")
      .find({ userEmail: req.user.email })
      .sort({ borrowDate: -1 })
      .toArray();

    return res.json(borrows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch borrows" });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid borrow id" });
    }

    const db = await getDb();
    const borrows = db.collection("borrows");
    const _id = new ObjectId(id);
    const borrow = await borrows.findOne({ _id });

    if (!borrow) {
      return res.status(404).json({ message: "Borrow not found" });
    }

    if (String(borrow.userEmail || "").toLowerCase() !== req.user.email) {
      return res
        .status(403)
        .json({ message: "You can only return your own borrows" });
    }

    await borrows.deleteOne({ _id });
    await db
      .collection("books")
      .updateOne({ _id: borrow.bookId }, { $inc: { availableCopies: 1 } });

    return res.json({ message: "Book returned successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to return book" });
  }
});

export default router;
