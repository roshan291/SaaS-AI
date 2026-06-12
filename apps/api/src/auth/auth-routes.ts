import { Router } from "express";

import { AuthService }
from "./auth-service";
import { authMiddleware } from "./auth-middleware";
import { allowRoles } from "./role-middleware";
import { ROLES } from "@saas/shared";

const router = Router();

const authService =
  new AuthService();

router.post(
  "/login",
  async (req, res) => {

    try {

      const result =
        await authService.login(
          req.body.email,
          req.body.password
        );

      res.json(result);

    } catch (error: any) {

      res.status(401).json({
        message:
          error.message
      });
    }
  }
);

router.get(
  "/me",
  authMiddleware,
  async (req: any, res) => {

    const result =
      await authService.me(
        req.user.userId,
        req.user.workspaceId
      );

    res.json(result);
  }
);

//Owner Only
router.get(
  "/admin-dashboard",

  authMiddleware,

  allowRoles([
    ROLES.OWNER
  ]),

  async (req, res) => {

    res.json({
      message:
        "Owner Access"
    });
  }
);

//Owner + Admin
router.get(
  "/manage-users",

  authMiddleware,

  allowRoles([
    ROLES.OWNER,
    ROLES.ADMIN
  ]),

  async (req, res) => {

    res.json({
      message:
        "Manage Users"
    });
  }
);

//Owner + Admin + Editor
router.post(
  "/posts",

  authMiddleware,

  
  allowRoles([
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.EDITOR
  ]),

  async (req, res) => {

    res.json({
      message:
        "Create Post"
    });
  }
);

//Everyone

router.get( "/profile", authMiddleware,
  async (req, res) => {
    res.json((req as any).user);
  }
);



export default router;