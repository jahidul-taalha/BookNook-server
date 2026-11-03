import "dotenv/config";
import express from "express";
import cors from "cors";
import { getDb, ensureIndexes } from "./db.js";

const app = express();

const allowedOrigins = [process.env.CLIENT_URL, "http://localhost:3000"].filter(
  Boolean
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.type("text/plain").send("BookNook server is running");
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message =
    status === 500 ? "Internal server error" : err.message || "Request failed";
  res.status(status).json({ message });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await getDb();
  await ensureIndexes();
  app.listen(PORT, () => {
    console.log(`BookNook server is running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error("Failed to start BookNook server:", error.message);
    process.exit(1);
  });
} else {
  ensureIndexes().catch((error) => {
    console.error("Failed to initialize database:", error.message);
  });
}

export default app;
