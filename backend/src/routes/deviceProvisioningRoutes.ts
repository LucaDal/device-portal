import { Router } from "express";
import { DeviceConfigurationController } from "../controllers/deviceConfigurationController";
import { MqttDynsecController } from "../controllers/mqttDynsecController";
import { requireDeviceCodeSecret } from "../middleware/deviceAuth";
import { deviceRequestLogger } from "../middleware/deviceRequestLogger";
import { DEVICE_REQUEST_LOG_TYPES } from "../services/deviceRequestLogService";

const router = Router();

router.get(
    "/configuration",
    deviceRequestLogger(DEVICE_REQUEST_LOG_TYPES.DEVICE_CONFIGURATION),
    requireDeviceCodeSecret,
    DeviceConfigurationController.getConfiguration
);
router.get("/mqtt-configuration", requireDeviceCodeSecret, MqttDynsecController.deviceConfiguration);

export default router;
