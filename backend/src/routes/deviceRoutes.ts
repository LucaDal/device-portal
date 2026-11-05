import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceController } from "../controllers/deviceController";
import { adminOnly } from "../middleware/adminOnly";
import { allowRoles } from "../middleware/allowRoles";
import { ROLES } from "@shared/constants/auth";
import { DeviceDashboardController } from "../controllers/deviceDashboardController";

const router = Router();

router.get("/", authMiddleware, DeviceController.list);
router.post("/", authMiddleware, adminOnly, DeviceController.create);
router.put("/:code/mqtt", authMiddleware, adminOnly, DeviceController.updateMqtt);
router.post("/:code/secret-code/regenerate", authMiddleware, adminOnly, DeviceController.regenerateSecretCode);
router.put("/:code/properties", authMiddleware, DeviceController.updateProperties);
router.get("/:code/widgets", authMiddleware, DeviceDashboardController.list);
router.put(
    "/:code/widgets",
    authMiddleware,
    allowRoles([ROLES.ADMIN, ROLES.DEV]),
    DeviceDashboardController.update
);
router.post(
    "/:code/widgets/:widgetId/action",
    authMiddleware,
    DeviceDashboardController.runAction
);
router.get("/:code/shares", authMiddleware, DeviceController.listShares);
router.post("/:code/shares", authMiddleware, DeviceController.createShare);
router.delete("/:code/shares/user/:userId", authMiddleware, DeviceController.removeShare);
router.delete(
    "/:code/shares/invitations/:id",
    authMiddleware,
    DeviceController.revokeShareInvitation
);
router.post("/register", authMiddleware, DeviceController.register);
router.delete("/:code", authMiddleware, DeviceController.delete);

export default router;
