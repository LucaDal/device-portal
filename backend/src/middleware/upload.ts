import multer from "multer";
import type { NextFunction, Request, Response } from "express";

const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE,
  },
});

export function singleUpload(fieldName: string) {
  const middleware = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: unknown) => {
      if (!err) {
        return next();
      }

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).send({ error: "File too large (max 10MB)" });
      }

      return res.status(400).send({ error: "Invalid upload payload" });
    });
  };
}
