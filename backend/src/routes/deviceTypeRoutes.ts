import { Router, json } from "express";
import { authMiddleware } from "../middleware/auth";
import { DeviceDashboardController } from "../controllers/deviceDashboardController";
import { DeviceTypeController } from "../controllers/deviceTypeController";
import { adminOnly } from "../middleware/adminOnly";
import { singleUpload } from "../middleware/upload";
const router = Router();

router.get("/", authMiddleware, DeviceTypeController.list);
router.get("/:id/widgets", authMiddleware, adminOnly, DeviceDashboardController.typeConfiguration);
router.put("/:id/widgets", authMiddleware, adminOnly, json(), DeviceDashboardController.updateTypeConfiguration);
router.put("/:id/mqtt", authMiddleware, adminOnly, json(), DeviceTypeController.updateMqtt);
router.post(
    "/",
    authMiddleware,
    adminOnly,
    singleUpload("firmware_build"), // nome del campo file nel formData
    DeviceTypeController.create
);

// PUT //:id (edit)
router.put(
    "/:id",
    authMiddleware,
    adminOnly,
    singleUpload("firmware_build"),
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
