import { Router } from "express";
import { MqttController } from "../controllers/mqttController";
import { authMiddleware } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";
import { basicAuthMiddleware } from "../middleware/basicAuth";
import { deviceRequestLogger } from "../middleware/deviceRequestLogger";
import { DEVICE_REQUEST_LOG_TYPES } from "../services/deviceRequestLogService";

const router = Router();

// EMQX HTTP ACL hook
router.post("/acl", MqttController.acl);

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
