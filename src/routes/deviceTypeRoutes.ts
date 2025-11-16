import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceTypeController } from "../controllers/deviceTypeController";

const router = Router();

router.get("/", authMiddleware, DeviceTypeController.list);
router.post("/", authMiddleware, DeviceTypeController.create);

export default router;
