import "./env.js";
import { MongoClient } from "mongodb";

let clientPromise = null;
let indexesPromise = null;

function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  const client = new MongoClient(uri);
  return client.connect();
}

export async function getDb() {
  if (!clientPromise) {
    clientPromise = connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  const client = await clientPromise;
  return client.db(process.env.DB_NAME || "booknook");
}

export function ensureIndexes() {
  if (!indexesPromise) {
    indexesPromise = getDb()
      .then((db) =>
        db
          .collection("borrows")
          .createIndex({ bookId: 1, userEmail: 1 }, { unique: true })
      )
      .catch((error) => {
        indexesPromise = null;
        throw error;
      });
  }

  return indexesPromise;
}
