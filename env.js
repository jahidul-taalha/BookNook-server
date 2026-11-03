import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("./.env", import.meta.url));

dotenv.config({ path: envPath, quiet: true });

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}
