
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { UsersController } from "../controllers/usersController";

const router = Router();

router.patch("/users/:id", authMiddleware, UsersController.update);
router.get("/users", authMiddleware, UsersController.list);
router.delete("/users/:id", authMiddleware, UsersController.delete);
router.post("/users/invite", authMiddleware, UsersController.invite);
router.get("/users/invitations", authMiddleware, UsersController.listInvitations);
router.delete("/users/invitations/:id", authMiddleware, UsersController.revokeInvitation);

export default router;
