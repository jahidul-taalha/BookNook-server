import { jwtVerify } from "jose";

export async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token is required" });
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ message: "Authorization token is required" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] }
    );

    if (!payload.email) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.user = {
      email: String(payload.email).toLowerCase(),
      name: payload.name ? String(payload.name) : "",
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
