# BookNook Server

Express + MongoDB REST API for a small online library (add, borrow, return books).

## Stack

- Node.js with ES modules (`"type": "module"`). Never use `require`.
- Express 5, `mongodb` driver, `jose` for JWT verification, `cors`, `dotenv`.
- Deploy target: Vercel (app exported, `vercel.json` present), also runs locally with `app.listen`.

## Layout

- `index.js` - Express app, middleware, route mounting, listen/export.
- `db.js` - cached MongoDB connection and index setup.
- `middleware/auth.js` - `verifyToken` (HS256 JWT via `jose`).
- `routes/books.js` - `/books` routes.
- `routes/borrows.js` - `/borrows` routes.
- `scripts/test-api.js` - end-to-end API self-check.

## Commands

- `npm run dev` - start with nodemon.
- `npm start` - start once.
- `npm test` - run API self-check (spawns server on a test port).

## Rules

- Never read, print, overwrite, edit, or commit `.env`. Use `.env.example` for names only.
- Ownership is always derived from `req.user` (JWT), never from request body name/email.
- Errors return JSON `{ message }` with correct status codes and use try/catch.
- Do not run `git push`.
