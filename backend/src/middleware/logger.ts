import type { Request, Response, NextFunction } from "express";

export function logger(
  req: Request,
  res: Response,
  next: NextFunction // tipo esplicitato
): void {
  console.log(`[${req.method}] ${req.path}`);
  next();
}

