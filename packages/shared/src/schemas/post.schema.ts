// packages/shared/src/schemas/post.schema.ts

import { z } from "zod";

// Body shape for POST /api/v1/posts. `workspaceId` is intentionally absent —
// it is derived from the caller's JWT to prevent tenant-spoofing.
export const CreatePostSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(1).max(20_000),
  status: z
    .enum(["draft", "scheduled", "published"])
    .default("draft")
});

export type CreatePostDto = z.infer<typeof CreatePostSchema>;

export const UpdatePostSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  content: z.string().min(1).max(20_000).optional(),
  status: z.enum(["draft", "scheduled", "published"]).optional()
});

export type UpdatePostDto = z.infer<typeof UpdatePostSchema>;