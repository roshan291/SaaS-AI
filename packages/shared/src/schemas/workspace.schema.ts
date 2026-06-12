// packages/shared/src/schemas/workspace.schema.ts

import { z } from "zod";

// Body shape for POST /api/v1/workspaces. `ownerId` is intentionally absent —
// it is derived from the caller's JWT (so a user cannot create a workspace
// owned by someone else). `plan` defaults to "free"; upgrades go through a
// separate billing flow.
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(3).max(80),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
      "Slug must be lowercase letters, digits, or dashes"
    ),
  settings: z
    .object({
      timezone: z.string().min(1).default("UTC"),
      locale: z.string().min(1).default("en-US")
    })
    .default({ timezone: "UTC", locale: "en-US" })
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;