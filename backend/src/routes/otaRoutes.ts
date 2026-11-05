import { Router } from "express";
import { OtaController } from "../controllers/otaController";
import { adminOnly } from "../middleware/adminOnly";
import { basicAuthMiddleware } from "../middleware/basicAuth";
import {
    requireDeviceCodeTypeSecret,
    requireDeviceTypeSecretOrAdminBasic,
    requireDeviceTypeIdHeader,
} from "../middleware/deviceAuth";
import { deviceRequestLogger } from "../middleware/deviceRequestLogger";
import { DEVICE_REQUEST_LOG_TYPES } from "../services/deviceRequestLogService";
import { singleUpload } from "../middleware/upload";
const router = Router();

router.get(
    "/firmware",
    deviceRequestLogger(DEVICE_REQUEST_LOG_TYPES.OTA_BUILD),
    requireDeviceCodeTypeSecret,
    OtaController.downloadFirmware
);
router.get(
    "/firmware/version",
    deviceRequestLogger(DEVICE_REQUEST_LOG_TYPES.OTA_VERSION),
    requireDeviceTypeSecretOrAdminBasic,
    OtaController.getFirmwareVersion
);
router.put(
    "/firmware",
    basicAuthMiddleware,
    adminOnly,
    requireDeviceTypeIdHeader,
    singleUpload("file"),
    OtaController.uploadFirmware
);

export default router;
