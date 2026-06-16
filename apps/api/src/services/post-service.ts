import { PostRepository } from "@saas/db";
import type { PostSource } from "@saas/shared";
import { Errors } from "../lib/respond";
import { integrationsService } from "./integrations-service";

interface CreatePostInput {
    workspaceId: string;
    title: string;
    content: string;
    status?: "draft" | "scheduled" | "published";
    // Optional media + targeting metadata for the manual composer. The
    // existing AI-generation flow keeps calling this service with only
    // {title, content, status} and works unchanged.
    imageUrl?: string | null;
    imageStorageKey?: string | null;
    videoUrl?: string | null;
    videoStorageKey?: string | null;
    hashtags?: string[];
    platforms?: string[];
    // Provenance — "ai" for posts built from a Studio generation, "manual"
    // for user-authored content. Defaults to "manual" downstream.
    source?: PostSource;
}

interface UpdatePostInput {
    title?: string;
    content?: string;
    status?: "draft" | "scheduled" | "published";
    imageUrl?: string | null;
    imageStorageKey?: string | null;
    videoUrl?: string | null;
    videoStorageKey?: string | null;
    hashtags?: string[];
    platforms?: string[];
    source?: PostSource;
}

export class PostService {

    async createPost(data: CreatePostInput) {
        return PostRepository.create({
            workspaceId: data.workspaceId,
            title: data.title,
            content: data.content,
            status: data.status ?? "draft",
            imageUrl: data.imageUrl ?? null,
            imageStorageKey: data.imageStorageKey ?? null,
            videoUrl: data.videoUrl ?? null,
            videoStorageKey: data.videoStorageKey ?? null,
            hashtags: data.hashtags ?? [],
            platforms: data.platforms ?? [],
            source: data.source ?? "manual"
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

    async publishPost(
        postId: string,
        workspaceId: string,
        opts: { platforms?: string[] } = {}
    ) {
        // Load the post first so we know which platforms to fan out to and
        // can surface a useful error if it has no targets.
        const post = await PostRepository.findByIdAndWorkspace(
            postId,
            workspaceId
        );
        if (!post) throw Errors.notFound("Post");

        const postPlatforms: string[] = Array.isArray((post as unknown as {
            platforms?: string[];
        }).platforms)
            ? (post as unknown as { platforms: string[] }).platforms
            : [];

        if (postPlatforms.length === 0) {
            throw Errors.validation(
                "Post has no target platforms — add at least one before publishing"
            );
        }

        // Caller can pass an explicit subset (e.g. retry only the platforms
        // that failed). Anything outside the post's own target list is
        // silently dropped so a stale FE can't smuggle in new platforms.
        const requested = Array.isArray(opts.platforms) && opts.platforms.length
            ? opts.platforms.filter((p) => postPlatforms.includes(p))
            : postPlatforms;

        if (requested.length === 0) {
            throw Errors.validation(
                "None of the requested platforms are configured on this post"
            );
        }

        // Flip the post to "published" optimistically. Per-platform success
        // is tracked in publishResults; the post-level status reflects user
        // *intent*, not the union of platform outcomes.
        const updated = await PostRepository.publish(postId, workspaceId);
        if (!updated) throw Errors.notFound("Post");

        // Kick off one queue job per platform. The worker writes per-platform
        // results back onto Post.publishResults as each job completes.
        await integrationsService.fanOutPublish({
            workspaceId,
            postId,
            platforms: requested
        });

        // Re-read so the response includes the seeded publishResults map.
        // Returns just the post — per-platform fan-out summary is encoded
        // on Post.publishResults so the FE has a single source of truth.
        const fresh = await PostRepository.findByIdAndWorkspace(
            postId,
            workspaceId
        );
        return fresh ?? updated;
    }

    async updatePost(
        postId: string,
        workspaceId: string,
        data: UpdatePostInput
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
