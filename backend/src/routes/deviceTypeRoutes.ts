import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceTypeController } from "../controllers/deviceTypeController";
import { adminOnly } from "../middleware/adminOnly";

import multer from "multer";
const upload = multer();
const router = Router();

router.get("/", authMiddleware, DeviceTypeController.list);
router.post(
    "/",
    authMiddleware,
    adminOnly,
    upload.single("firmware_build"), // nome del campo file nel formData
    DeviceTypeController.create
);

// PUT //:id (edit)
router.put(
    "/:id",
    authMiddleware,
    adminOnly,
    upload.single("firmware_build"),
    DeviceTypeController.update
);

// DELETE //:id
router.delete(
    "/:id",
    authMiddleware,
    adminOnly,
    DeviceTypeController.delete
);


export default router;
