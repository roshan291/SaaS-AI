import { Router } from "express";

import { CreateUserSchema } from "@saas/shared";
import { UserService } from "../services/user-service";
import { authMiddleware } from "../auth/auth-middleware";
import { AuthRequest } from "@saas/shared";

const router = Router();

const userService = new UserService();

router.post("/", async (req, res) => {
    try {

        const data =
            CreateUserSchema.parse(req.body);

        const user =
            await userService.createUser(data);

        res.status(201).json(user);

    } catch (error: any) {

        console.error(error);

        res.status(400).json({
            message: error.message
        });
    }
});

router.get(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res) => {

    const user =
      await userService.getUserById(
        Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
        req.user!.workspaceId
      );

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json(user);
  }
);
router.get(
  "/",
  authMiddleware,
  async (req: AuthRequest, res) => {

    const users =
      await userService.getUsers(
        req.user!.workspaceId
      );

    res.json(users);
  }
);

export default router;