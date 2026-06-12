// packages/shared/src/schemas/ai.schema.ts

import { z } from "zod";

export const GenerateContentSchema =
  z.object({
    topic: z.string().min(3)
  });

export type GenerateContentDto =
  z.infer<
    typeof GenerateContentSchema
  >;