import { Router } from "express";
import { OtaController } from "../controllers/otaRequestController";
import { adminOnly } from "../middleware/adminOnly";
import { basicAuthMiddleware } from "../middleware/basicAuth";
import {
    requireDeviceCodeSecret,
    requireDeviceCodeTypeSecret,
    requireDeviceTypeSecretOrAdminBasic,
    requireDeviceTypeIdHeader,
} from "../middleware/openRequestAuth";

import multer from "multer";
const upload = multer();
const router = Router();

router.get("/properties", requireDeviceCodeSecret, OtaController.getProperties);
router.get("/build", requireDeviceCodeTypeSecret, OtaController.getBuildFromCode);
router.get("/version", requireDeviceTypeSecretOrAdminBasic, OtaController.getBuildInfoFromCode);
router.post(
    "/upload",
    basicAuthMiddleware,
    adminOnly,
    requireDeviceTypeIdHeader,
    upload.single("file"),
    OtaController.UploadNewBuild
);

export default router;
