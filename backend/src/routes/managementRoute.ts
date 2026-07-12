
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { UsersController } from "../controllers/usersController";
import { SettingsController } from "../controllers/settingsController";
import { adminOnly } from "../middleware/adminOnly";
import { DeviceController } from "../controllers/deviceController";

const router = Router();

router.patch("/users/:id", authMiddleware, adminOnly, UsersController.update);
router.get("/users", authMiddleware, adminOnly, UsersController.list);
router.delete("/users/:id", authMiddleware, adminOnly, UsersController.delete);
router.post("/users/invite", authMiddleware, adminOnly, UsersController.invite);
router.get("/users/invitations", authMiddleware, adminOnly, UsersController.listInvitations);
router.delete("/users/invitations/:id", authMiddleware, adminOnly, UsersController.revokeInvitation);
router.get("/users/:id/mqtt-acl", authMiddleware, adminOnly, UsersController.listMqttUserAcl);
router.get("/settings/mqtt", authMiddleware, adminOnly, SettingsController.getMqttBrokerSettings);
router.put("/settings/mqtt", authMiddleware, adminOnly, SettingsController.upsertMqttBrokerSettings);
router.post("/devices/revoke-ownership", authMiddleware, adminOnly, DeviceController.revokeOwnership);

export default router;
