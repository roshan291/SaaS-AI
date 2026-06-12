import { Router } from "express";
import { PostService } from "src/services/post-service";
import { CreatePostSchema } from "@saas/shared";
import { authMiddleware } from "../auth/auth-middleware";
import { AuthRequest } from "@saas/shared";

const router = Router();
const service = new PostService();

router.post(
    "/",
    authMiddleware,
    async (req: AuthRequest, res) => {
        try {

            const data =
                CreatePostSchema.parse(req.body);

            const post =
                await service.createPost({
                    ...data,
                    workspaceId: req.user!.workspaceId
                });

            res.status(201).json(post);

        } catch (error: any) {

            res.status(400).json({
                message: error.message
            });
        }
    }
);

router.get(
    "/",
    authMiddleware,
    async (req: AuthRequest, res) => {
        try {
            const posts =
                await service.getPosts(
                    req.user!.workspaceId
                );

            res.json(posts);
        } catch (error: any) {

            res.status(400).json({
                message: error.message
            });
        }
    }
);





export default router;