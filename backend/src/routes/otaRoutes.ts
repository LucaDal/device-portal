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
import { singleUpload } from "../middleware/upload";
const router = Router();

router.get("/properties", requireDeviceCodeSecret, OtaController.getProperties);
router.get("/build", requireDeviceCodeTypeSecret, OtaController.getBuildFromCode);
router.get("/version", requireDeviceTypeSecretOrAdminBasic, OtaController.getBuildInfoFromCode);
router.post(
    "/upload",
    basicAuthMiddleware,
    adminOnly,
    requireDeviceTypeIdHeader,
    singleUpload("file"),
    OtaController.UploadNewBuild
);

export default router;
