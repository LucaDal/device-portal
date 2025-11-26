
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { UsersController } from "../controllers/usersController";

const router = Router();

router.patch("/users/:id", authMiddleware, UsersController.update);
router.get("/users", authMiddleware, UsersController.list);
router.delete("/users/:id", authMiddleware, UsersController.delete);

export default router;
