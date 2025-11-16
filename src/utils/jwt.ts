import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "cambiami_subito";

export function generateToken(user: any) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: "1h",
  });
}
