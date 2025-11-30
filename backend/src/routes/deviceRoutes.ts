import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceController } from "../controllers/deviceController";

const router = Router();

router.get("/", authMiddleware, DeviceController.list);
router.get("/:code/properties", DeviceController.getProperties);
router.post("/", authMiddleware, DeviceController.create);
router.put("/:code/properties", authMiddleware, DeviceController.updateProperties);
router.post("/register", authMiddleware, DeviceController.register);
router.delete("/:code", authMiddleware, DeviceController.delete);

export default router;
