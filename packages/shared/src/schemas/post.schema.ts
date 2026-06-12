// packages/shared/src/schemas/post.schema.ts

import { z } from "zod";

export const CreatePostSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(1),
  workspaceId: z.string().min(1),
  status: z.enum(["draft", "scheduled", "published"]).default("draft")
});

export type CreatePostDto = z.infer<typeof CreatePostSchema>;