import type { Request, Response, NextFunction } from "express";
import { ROLES } from "@shared/constants/auth";

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if ((req.user as any)?.role !== ROLES.ADMIN) {
    return res.status(403).send({ error: "Admin only" });
  }
  next();
}
