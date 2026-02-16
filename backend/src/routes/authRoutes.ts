import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Route intentionally disabled: self-signup is not allowed right now.
// Keep for future rollout:
// router.post("/signup", AuthController.signup);
router.post("/login", AuthController.login);
router.post("/change-password", authMiddleware, AuthController.changePassword);

export default router;
