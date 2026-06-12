// packages/shared/src/schemas/workspace.schema.ts

import { z } from "zod";

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3),
  plan: z.enum(["free", "pro", "enterprise"]).default("free"),
  ownerId: z.string().min(1),
  isActive: z.boolean().default(true),
  settings: z.object({
    timezone: z.string().min(1),
    locale: z.string().min(1)
  }),
  usage: z.object({
    postsGenerated: z.number().default(0),
    aiCreditsUsed: z.number().default(0)
  })
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;