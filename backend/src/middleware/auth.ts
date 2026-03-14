import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { DB } from "../config/database";
import { AUTH_ERROR_CODES, Role } from "@shared/constants/auth";
import { User } from "@shared/types/user";

const JWT_SECRET = process.env.JWT_SECRET || "cambiami_subito";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).send({ error: "Missing token" });

  if (!header.startsWith("Bearer ")) {
    return res.status(401).send({ error: "Invalid token" });
  }

  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).send({ error: "Invalid token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id?: number };
    if (!decoded?.id) {
      return res.status(401).send({ error: "Invalid token" });
    }

    const user = DB.prepare(
      "SELECT id, email, role, must_change_password FROM users WHERE id = ?"
    ).get(decoded.id) as
      | { id: number; email: string; role: Role; must_change_password: number }
      | undefined;

    if (!user) {
      return res.status(401).send({ error: "Invalid token user" });
    }

    const changingPassword = req.originalUrl === "/auth/change-password";
    if (user.must_change_password && !changingPassword) {
      return res.status(403).send({
        error: "Password change required",
        code: AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
      });
    }

    req.user = user as User;
    next();
  } catch {
    return res.status(401).send({ error: "Invalid token" });
  }
}
