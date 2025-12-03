import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceTypeController } from "../controllers/deviceTypeController";

import multer from "multer";
const upload = multer();
const router = Router();

router.get("/", authMiddleware, DeviceTypeController.list);
router.post(
    "/",
    authMiddleware,
    upload.single("firmware_build"), // nome del campo file nel formData
    DeviceTypeController.create
);

// PUT //:id (edit)
router.put(
    "/:id",
    authMiddleware,
    upload.single("firmware_build"),
    DeviceTypeController.update
);

// DELETE //:id
router.delete(
    "/:id",
    authMiddleware,
    DeviceTypeController.delete
);


export default router;
