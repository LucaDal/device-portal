import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import { DB } from "../config/database";
import { AUTH_ERROR_CODES } from "@shared/constants/auth";
import { UserWithPassword } from "@shared/types/user";

function parseBasicAuthCredentials(req: Request): { email: string; password: string } | null {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Basic ")) return null;

  const encoded = header.slice(6).trim();
  if (!encoded) return null;

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex <= 0) return null;

  const email = decoded.slice(0, separatorIndex).trim().toLowerCase();
  const password = decoded.slice(separatorIndex + 1);
  if (!email || !password) return null;

  return { email, password };
}

export async function basicAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const credentials = parseBasicAuthCredentials(req);
  if (!credentials) {
    return res.status(401).send({
      error: "Missing or invalid Authorization header. Use Basic authentication.",
    });
  }

  const user = DB.prepare(
    "SELECT id, email, role, password_hash, must_change_password FROM users WHERE email = ?"
  ).get(credentials.email) as UserWithPassword | undefined;

  if (!user) {
    return res.status(401).send({ error: "Invalid email or password" });
  }

  const validPassword = await bcrypt.compare(credentials.password, user.password_hash);
  if (!validPassword) {
    return res.status(401).send({ error: "Invalid email or password" });
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    must_change_password: user.must_change_password,
    created_at: user.created_at,
  };

  if (user.must_change_password) {
    return res.status(403).send({
      error: "Password change required",
      code: AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
    });
  }

  next();
}
