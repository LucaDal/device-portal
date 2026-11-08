import type { Request, Response, NextFunction } from "express";
import { getUserSession } from "../repositories/userRepository";
import { AUTH_ERROR_CODES } from "@shared/constants/auth";
import { User } from "@shared/types/user";
import { readAuthToken } from "../utils/authCookie";
import { verifyToken } from "../utils/jwt";

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  return token || null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readAuthToken(req) || readBearerToken(req);
  if (!token) {
    return res.status(401).send({ error: "Missing token" });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded?.id) {
      return res.status(401).send({ error: "Invalid token" });
    }

    const user = getUserSession(decoded.id);

    if (!user || decoded.sessionVersion !== user.session_version) {
      return res.status(401).send({ error: "Invalid token user" });
    }

    const changingPassword = req.originalUrl === "/auth/change-password";
    if (user.must_change_password && !changingPassword) {
      return res.status(403).send({
        error: "Password change required",
        code: AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
      });
    }

    res.locals.sessionVersion = user.session_version;
    res.locals.authExpiresAt = Number(decoded.exp) * 1000;
    req.user = user as User;
    next();
  } catch {
    return res.status(401).send({ error: "Invalid token" });
  }
}
