import { Router } from "express";

import {
    AUDIT_ACTIONS,
    CreateUserSchema,
    ROLES,
    type AuthRequest
} from "@saas/shared";

import { UserService } from "../services/user-service";
import { authMiddleware } from "../auth/auth-middleware";
import { allowRoles } from "../auth/role-middleware";
import { asyncHandler } from "../lib/async-handler";
import { respond, Errors } from "../lib/respond";
import { emitAudit } from "../lib/audit";

const router = Router();
const userService = new UserService();

// Inviting a teammate: only the workspace OWNER or an ADMIN can do this.
// `workspaceId` is server-derived from the caller's JWT — body cannot set it.
// `role` is restricted by the Zod schema to non-owner roles.
router.post(
    "/",
    authMiddleware,
    allowRoles([ROLES.OWNER, ROLES.ADMIN]),
    asyncHandler(async (req: AuthRequest, res) => {
        const data = CreateUserSchema.parse(req.body);

        const user = await userService.createUser({
            workspaceId: req.user!.workspaceId,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            password: data.password,
            role: data.role
        });

        emitAudit({
            req,
            action: AUDIT_ACTIONS.USER_CREATED,
            entity: "user",
            entityId: user?.id,
            metadata: { role: user?.role }
        });

        respond(res, user, 201);
    })
);

router.get(
    "/:id",
    authMiddleware,
    asyncHandler(async (req: AuthRequest, res) => {
        const id = String(req.params.id);
        const user = await userService.getUserById(
            id,
            req.user!.workspaceId
        );

        if (!user) {
            throw Errors.notFound("User");
        }

        respond(res, user);
    })
);

router.get(
    "/",
    authMiddleware,
    allowRoles([ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR]),
    asyncHandler(async (req: AuthRequest, res) => {
        const users = await userService.getUsers(req.user!.workspaceId);
        respond(res, users);
    })
);

export default router;
