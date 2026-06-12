import { z } from "zod";

export const GenerateVideoSchema =
  z.object({
    topic:
      z.string().min(3)
  });

export type GenerateVideoDto =
  z.infer<
    typeof GenerateVideoSchema
  >;