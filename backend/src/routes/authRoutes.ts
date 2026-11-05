import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { loginRateLimitMiddleware } from "../middleware/rateLimit";

const router = Router();

router.post("/login", loginRateLimitMiddleware, AuthController.login);
router.post("/change-password", authMiddleware, AuthController.changePassword);
router.get("/me", authMiddleware, AuthController.me);
router.post("/logout", AuthController.logout);

export default router;
