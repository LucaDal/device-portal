import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceController } from "../controllers/deviceController";
import { OtaController } from "../controllers/otaRequestController";

const router = Router();

router.get("/", authMiddleware, DeviceController.list);
router.post("/", authMiddleware, DeviceController.create);
router.put("/:code/properties", authMiddleware, DeviceController.updateProperties);
router.post("/register", authMiddleware, DeviceController.register);
router.delete("/:code", authMiddleware, DeviceController.delete);

export default router;
