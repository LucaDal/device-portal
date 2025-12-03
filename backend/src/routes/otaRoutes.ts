import { Router } from "express";
import { OtaController } from "../controllers/otaRequestController";

import multer from "multer";
const upload = multer();
const router = Router();

router.get("/:dev_code/properties", OtaController.getProperties);
router.get("/:dev_code/build", OtaController.getBuildFromCode);
router.get("/:dev_code/version", OtaController.getBuildInfoFromCode);
router.post("/upload", upload.single("file"), OtaController.UploadNewBuild);

export default router;
