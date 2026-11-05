import { Router } from "express";
import { MqttController } from "../controllers/mqttController";
import { authMiddleware } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";
import { basicAuthMiddleware } from "../middleware/basicAuth";
import { deviceRequestLogger } from "../middleware/deviceRequestLogger";
import { DEVICE_REQUEST_LOG_TYPES } from "../services/deviceRequestLogService";
import { MqttDynsecController } from "../controllers/mqttDynsecController";

const router = Router();

router.get("/admin/dynsec", authMiddleware, adminOnly, MqttDynsecController.status);
router.get("/admin/dynsec/:deviceCode/acl", authMiddleware, adminOnly, MqttDynsecController.deviceAcls);
router.post("/admin/dynsec/reconcile", authMiddleware, adminOnly, MqttDynsecController.reconcile);
router.post("/admin/dynsec/:deviceCode/rotate", authMiddleware, adminOnly, MqttDynsecController.rotate);

router.get("/admin/acl/:deviceCode", authMiddleware, adminOnly, MqttController.listAclRules);
router.get("/stream", authMiddleware, MqttController.streamMessages);
router.post("/session-publish", authMiddleware, MqttController.publishMessageWithSession);
router.post(
    "/publish",
    deviceRequestLogger(DEVICE_REQUEST_LOG_TYPES.MQTT_API_PUBLISH),
    basicAuthMiddleware,
    MqttController.publishMessage
);

export default router;
