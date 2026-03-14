import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceController } from "../controllers/deviceController";
import { OtaController } from "../controllers/otaRequestController";
import { adminOnly } from "../middleware/adminOnly";

const router = Router();

router.get("/", authMiddleware, DeviceController.list);
router.post("/", authMiddleware, adminOnly, DeviceController.create);
router.post("/:code/ota-secret/regenerate", authMiddleware, adminOnly, DeviceController.regenerateOtaSecret);
router.put("/:code/properties", authMiddleware, DeviceController.updateProperties);
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
