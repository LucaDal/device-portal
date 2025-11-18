import type { Request, Response, NextFunction } from "express";

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if ((req.user as any)?.role !== "admin") {
    return res.status(403).send({ error: "Admin only" });
  }
  next();
}
