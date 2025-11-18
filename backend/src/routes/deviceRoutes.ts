import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceController } from "../controllers/deviceController";

const router = Router();

router.get("/", authMiddleware, DeviceController.list);
router.post("/", authMiddleware, DeviceController.create);

export default router;
