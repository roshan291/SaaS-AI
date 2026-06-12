import { z } from "zod";

export const CreateUserSchema =
    z.object({

        workspaceId:
            z.string(),

        firstName:
            z.string().min(2),

        lastName:
            z.string().min(2),

        email:
            z.string().email(),

        password:
            z.string().min(8).max(50),

        role:
            z.enum([
                "owner",
                "admin",
                "editor",
                "viewer"
            ]).default("viewer")
    });

export type CreateUserDto = z.infer<typeof CreateUserSchema>;