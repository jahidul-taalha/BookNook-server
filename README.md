# BookNook Server

Express + MongoDB REST API for a small online library. Users can add books, borrow them for 7 days, and return them. Authentication is an HS256 JWT sent as `Authorization: Bearer <token>`.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   | Variable      | Description                                      |
   | ------------- | ------------------------------------------------ |
   | `MONGODB_URI` | MongoDB connection string                        |
   | `DB_NAME`     | Database name (defaults to `booknook` if omitted) |
   | `JWT_SECRET`  | Shared HS256 secret used by the Next.js client   |
   | `CLIENT_URL`  | Allowed CORS origin for the client                |
   | `PORT`        | Local server port (defaults to `5000`)           |

   Never commit `.env`.

3. Run locally:

   ```bash
   npm run dev   # nodemon
   npm start     # single run
   npm test      # API self-check against a test database
   node scripts/verify-post-book.js  # POST /books using JWT_SECRET from .env
   ```

The app is also exported for Vercel (`vercel.json` included). The MongoDB connection is cached and the unique `borrows` index on `{ bookId, userEmail }` is created on startup.

## Authentication

The JWT is signed with `JWT_SECRET` using HS256 and contains `email`, `name`, and `sub` in its payload. Protected routes return `401` when the token is missing, invalid, or expired.

## API

All errors return JSON in the form `{ "message": "..." }`.

| Method | Route            | Auth      | Description                                                                 |
| ------ | ---------------- | --------- | --------------------------------------------------------------------------- |
| GET    | `/`              | Public    | Health text: `BookNook server is running`                                   |
| GET    | `/books`         | Public    | List books. Query: `search`, `category`, `sort` (`newest`/`oldest`/`title`), `limit` |
| GET    | `/books/:id`     | JWT       | Get one book                                                                |
| POST   | `/books`         | JWT       | Add a book. `addedBy` comes from the token                                  |
| PATCH  | `/books/:id`     | JWT owner | Update a book. `totalCopies` changes adjust `availableCopies`               |
| DELETE | `/books/:id`     | JWT owner | Delete a book and its borrows                                               |
| POST   | `/borrows`       | JWT       | Borrow a book. Body: `{ "bookId": "<id>" }`, due in 7 days                  |
| GET    | `/borrows`       | JWT       | List the current user's borrows, newest first                               |
| DELETE | `/borrows/:id`   | JWT owner | Return a book and increase `availableCopies`                                |

Borrowing rules:

- Already borrowed by this user: `409 You have already borrowed this book`
- No copies available: `400 This book is not available right now`

## Data

```js
// books
{
  title, author, category, image, description,
  totalCopies, availableCopies,
  addedBy: { name, email },
  createdAt
}

// borrows
{
  bookId, bookTitle, bookImage,
  userName, userEmail,
  borrowDate, returnDate
}
```

Categories: `Fiction`, `Science`, `History`, `Kids`, `Others`.
