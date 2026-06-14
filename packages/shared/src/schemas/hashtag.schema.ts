import { z } from "zod";

export const GenerateHashtagSchema =
  z.object({
    topic:
      z.string().min(3).max(500)
  });

export type GenerateHashtagDto =
  z.infer<
    typeof GenerateHashtagSchema
  >;