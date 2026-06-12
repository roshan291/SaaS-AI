import { PostRepository } from "@saas/db";
import { Errors } from "../lib/respond";

interface CreatePostInput {
    workspaceId: string;
    title: string;
    content: string;
    status?: "draft" | "scheduled" | "published";
}

export class PostService {

    async createPost(data: CreatePostInput) {
        return PostRepository.create({
            workspaceId: data.workspaceId,
            title: data.title,
            content: data.content,
            status: data.status ?? "draft"
        });
    }

    async getPostById(postId: string, workspaceId: string) {
        const post = await PostRepository.findByIdAndWorkspace(
            postId,
            workspaceId
        );
        if (!post) throw Errors.notFound("Post");
        return post;
    }

    async getPosts(
        workspaceId: string,
        opts: { status?: "draft" | "scheduled" | "published" } = {}
    ) {
        if (opts.status === "published") {
            return PostRepository.findPublished(workspaceId);
        }
        if (opts.status === "scheduled") {
            return PostRepository.findByStatus(workspaceId, "scheduled");
        }
        if (opts.status === "draft") {
            return PostRepository.findDrafts(workspaceId);
        }
        return PostRepository.findAllByWorkspace(workspaceId);
    }

    async publishPost(postId: string, workspaceId: string) {
        const post = await PostRepository.publish(postId, workspaceId);
        if (!post) throw Errors.notFound("Post");
        return post;
    }

    async updatePost(
        postId: string,
        workspaceId: string,
        data: Partial<{
            title: string;
            content: string;
            status: "draft" | "scheduled" | "published";
        }>
    ) {
        const post = await PostRepository.updateByWorkspace(
            postId,
            workspaceId,
            data
        );
        if (!post) throw Errors.notFound("Post");
        return post;
    }

    async deletePost(postId: string, workspaceId: string) {
        const post = await PostRepository.deleteByWorkspace(
            postId,
            workspaceId
        );
        if (!post) throw Errors.notFound("Post");
        return post;
    }
}
