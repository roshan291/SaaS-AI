import { z } from "zod";

export const GenerateImageSchema =
  z.object({
    topic:
      z.string().min(3)
  });

export type GenerateImageDto =
  z.infer<
    typeof GenerateImageSchema
  >;