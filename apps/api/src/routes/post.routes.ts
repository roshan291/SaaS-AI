import { Router } from "express";
import {
    AUDIT_ACTIONS,
    CreatePostSchema,
    ROLES,
    UpdatePostSchema,
    type AuthRequest
} from "@saas/shared";

import { PostService } from "../services/post-service";
import { authMiddleware } from "../auth/auth-middleware";
import { allowRoles } from "../auth/role-middleware";
import { asyncHandler } from "../lib/async-handler";
import { respond } from "../lib/respond";
import { emitAudit } from "../lib/audit";

const router = Router();
const service = new PostService();

const EDITOR_ROLES = [ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR];

router.post(
    "/",
    authMiddleware,
    allowRoles(EDITOR_ROLES),
    asyncHandler(async (req: AuthRequest, res) => {
        const data = CreatePostSchema.parse(req.body);

        const post = await service.createPost({
            workspaceId: req.user!.workspaceId,
            title: data.title,
            content: data.content,
            status: data.status
        });

        emitAudit({
            req,
            action: AUDIT_ACTIONS.POST_CREATED,
            entity: "post",
            entityId: post._id.toString(),
            metadata: { status: post.status }
        });

        respond(res, post, 201);
    })
);

router.get(
    "/",
    authMiddleware,
    asyncHandler(async (req: AuthRequest, res) => {
        const status = req.query.status as
            | "draft"
            | "scheduled"
            | "published"
            | undefined;

        const posts = await service.getPosts(req.user!.workspaceId, {
            status
        });

        respond(res, posts);
    })
);

router.get(
    "/:id",
    authMiddleware,
    asyncHandler(async (req: AuthRequest, res) => {
        const id = String(req.params.id);
        const post = await service.getPostById(id, req.user!.workspaceId);
        respond(res, post);
    })
);

router.patch(
    "/:id",
    authMiddleware,
    allowRoles(EDITOR_ROLES),
    asyncHandler(async (req: AuthRequest, res) => {
        const id = String(req.params.id);
        const data = UpdatePostSchema.parse(req.body);

        const post = await service.updatePost(
            id,
            req.user!.workspaceId,
            data
        );

        emitAudit({
            req,
            action: AUDIT_ACTIONS.POST_UPDATED,
            entity: "post",
            entityId: id,
            metadata: { changes: Object.keys(data) }
        });

        respond(res, post);
    })
);

router.delete(
    "/:id",
    authMiddleware,
    allowRoles([ROLES.OWNER, ROLES.ADMIN]),
    asyncHandler(async (req: AuthRequest, res) => {
        const id = String(req.params.id);
        const post = await service.deletePost(id, req.user!.workspaceId);

        emitAudit({
            req,
            action: AUDIT_ACTIONS.POST_DELETED,
            entity: "post",
            entityId: id
        });

        respond(res, post);
    })
);

router.post(
    "/:id/publish",
    authMiddleware,
    allowRoles(EDITOR_ROLES),
    asyncHandler(async (req: AuthRequest, res) => {
        const id = String(req.params.id);
        const post = await service.publishPost(id, req.user!.workspaceId);

        emitAudit({
            req,
            action: AUDIT_ACTIONS.POST_PUBLISHED,
            entity: "post",
            entityId: id
        });

        respond(res, post);
    })
);

export default router;
