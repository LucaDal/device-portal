import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/secrets";

const JWT_SECRET = getJwtSecret();

export function generateToken(user: any) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { id?: number; role?: string };
}
