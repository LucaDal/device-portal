import { Router } from "express";
import { MqttController } from "../controllers/mqttController";
import { authMiddleware } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";

const router = Router();

// EMQX HTTP Auth hook
router.post("/auth", MqttController.auth);

// EMQX HTTP ACL hook
router.post("/acl", MqttController.acl);

router.get("/admin/certificates", authMiddleware, adminOnly, MqttController.listCertificates);
router.post("/admin/certificates", authMiddleware, adminOnly, MqttController.upsertCertificate);
router.patch(
  "/admin/certificates/:clientId",
  authMiddleware,
  adminOnly,
  MqttController.setCertificateEnabled
);
router.delete(
  "/admin/certificates/:clientId",
  authMiddleware,
  adminOnly,
  MqttController.deleteCertificate
);
router.get("/admin/acl/:deviceCode", authMiddleware, adminOnly, MqttController.listAclRules);
router.post("/admin/acl/:deviceCode", authMiddleware, adminOnly, MqttController.upsertAclRule);
router.delete("/admin/acl/rules/:id", authMiddleware, adminOnly, MqttController.deleteAclRule);

export default router;
