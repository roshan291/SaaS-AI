import {
    PostRepository,
} from "@saas/db";

export class PostService {

    async createPost(data: any) {

        return PostRepository.create({
            ...data,
            status: "draft"
        });
    }

    async getPostById(
        postId: string,
        workspaceId: string
    ) {
        return PostRepository.findByIdAndWorkspace(
            postId,
            workspaceId
        );
    }
    async getPosts(workspaceId: string) {

        return PostRepository.findDrafts(
            workspaceId
        );
    }
    async publishPost(
        postId: string,
        workspaceId: string
    ) {

        const post =
            await PostRepository.publish(
                postId,
                workspaceId
            );

        if (!post) {
            throw new Error(
                "Post not found"
            );
        }

        return post;
    }
    async updatePost(
        postId: string,
        workspaceId: string,
        data: any
    ) {

        const post =
            await PostRepository.updateByWorkspace(
                postId,
                workspaceId,
                data
            );

        if (!post) {
            throw new Error(
                "Post not found"
            );
        }

        return post;
    }
    async deletePost(
        postId: string,
        workspaceId: string
    ) {

        const post =
            await PostRepository.deleteByWorkspace(
                postId,
                workspaceId
            );

        if (!post) {
            throw new Error(
                "Post not found"
            );
        }

        return post;
    }
}