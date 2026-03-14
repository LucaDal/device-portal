import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { loginRateLimitMiddleware } from "../middleware/rateLimit";

const router = Router();

// Route intentionally disabled: self-signup is not allowed right now.
// Keep for future rollout:
// router.post("/signup", AuthController.signup);
router.post("/login", loginRateLimitMiddleware, AuthController.login);
router.post("/change-password", authMiddleware, AuthController.changePassword);
router.get("/me", authMiddleware, AuthController.me);
router.post("/logout", AuthController.logout);

export default router;
