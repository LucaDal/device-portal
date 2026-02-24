import type { Request, Response, NextFunction } from "express";
import { ROLES } from "@shared/constants/auth";

export function devOnly(req: Request, res: Response, next: NextFunction) {
  if ((req.user as any)?.role !== ROLES.DEV) {
    return res.status(403).send({ error: "Dev only" });
  }
  next();
}
