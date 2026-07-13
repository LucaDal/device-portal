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
import { deviceRequestLogger } from "../middleware/deviceRequestLogger";
import { DEVICE_REQUEST_LOG_TYPES } from "../services/deviceRequestLogService";
import { singleUpload } from "../middleware/upload";
const router = Router();

router.get(
    "/properties",
    deviceRequestLogger(DEVICE_REQUEST_LOG_TYPES.OTA_PROPERTIES),
    requireDeviceCodeSecret,
    OtaController.getProperties
);
router.get(
    "/build",
    deviceRequestLogger(DEVICE_REQUEST_LOG_TYPES.OTA_BUILD),
    requireDeviceCodeTypeSecret,
    OtaController.getBuildFromCode
);
router.get(
    "/version",
    deviceRequestLogger(DEVICE_REQUEST_LOG_TYPES.OTA_VERSION),
    requireDeviceTypeSecretOrAdminBasic,
    OtaController.getBuildInfoFromCode
);
router.post(
    "/upload",
    basicAuthMiddleware,
    adminOnly,
    requireDeviceTypeIdHeader,
    singleUpload("file"),
    OtaController.UploadNewBuild
);

export default router;
