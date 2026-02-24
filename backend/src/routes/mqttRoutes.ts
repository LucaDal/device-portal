import { Router } from "express";
import { MqttController } from "../controllers/mqttController";
import { authMiddleware } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";

const router = Router();

// EMQX HTTP ACL hook
router.post("/acl", MqttController.acl);

router.get("/admin/acl/:deviceCode", authMiddleware, adminOnly, MqttController.listAclRules);
router.post("/admin/acl/:deviceCode", authMiddleware, adminOnly, MqttController.upsertAclRule);
router.delete("/admin/acl/rules/:id", authMiddleware, adminOnly, MqttController.deleteAclRule);
router.post("/publish", authMiddleware, MqttController.publishMessage);
router.get("/publish", authMiddleware, MqttController.publishMessage);

export default router;
