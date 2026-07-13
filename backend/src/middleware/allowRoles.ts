import type { Request, Response, NextFunction } from "express";
import { Role } from "@shared/constants/auth";

export function allowRoles(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req.user as any)?.role;
    if (!roles.includes(role)) {
      return res.status(403).send({ error: "Access denied" });
    }
    next();
  };
}
