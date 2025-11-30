import { Router } from "express";
import { OtaController } from "../controllers/otaRequestController";

const router = Router();

router.get("/:dev_code/properties", OtaController.getProperties);
router.get("/:dev_code/build", OtaController.getBuildFromCode);
router.get("/:dev_code/version", OtaController.getBuildInfoFromCode);
router.post("/", OtaController.UploadNewBuild);

export default router;
