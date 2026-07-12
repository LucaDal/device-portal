import { Router } from "express";
import { MqttController } from "../controllers/mqttController";
import { authMiddleware } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";
import { basicAuthMiddleware } from "../middleware/basicAuth";

const router = Router();

// EMQX HTTP ACL hook
router.post("/acl", MqttController.acl);

router.get("/admin/acl/:deviceCode", authMiddleware, adminOnly, MqttController.listAclRules);
router.get("/stream", authMiddleware, MqttController.streamMessages);
router.post("/session-publish", authMiddleware, MqttController.publishMessageWithSession);
router.post("/publish", basicAuthMiddleware, MqttController.publishMessage);

export default router;
