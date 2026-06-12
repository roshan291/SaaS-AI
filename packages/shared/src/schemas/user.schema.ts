import { z } from "zod";

// Roles that an authenticated admin/owner is allowed to assign when creating
// a teammate. `owner` is intentionally excluded — there is exactly one owner
// per workspace and ownership transfer is a separate flow.
export const AssignableRoleSchema = z.enum([
    "admin",
    "editor",
    "viewer"
]);

// Password policy: minimum 12 characters with at least one lowercase, one
// uppercase, one digit, and one symbol. Easy to relax later via env.
const PasswordSchema = z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128)
    .refine((v) => /[a-z]/.test(v), "Must contain a lowercase letter")
    .refine((v) => /[A-Z]/.test(v), "Must contain an uppercase letter")
    .refine((v) => /\d/.test(v), "Must contain a digit")
    .refine(
        (v) => /[^A-Za-z0-9]/.test(v),
        "Must contain a symbol"
    );

// Body shape for POST /api/v1/users (invite teammate).
// `workspaceId` is intentionally absent — it is derived from the caller's JWT.
// `role` is restricted to non-owner roles.
export const CreateUserSchema = z.object({
    firstName: z.string().min(2).max(60),
    lastName: z.string().min(2).max(60),
    email: z.string().email().max(254),
    password: PasswordSchema,
    role: AssignableRoleSchema.default("viewer")
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;

// Body shape for POST /api/v1/auth/register — bootstraps the first OWNER and
// (optionally) a brand-new workspace. This is the only place where role and
// workspace can be set on the request.
export const RegisterOwnerSchema = z.object({
    firstName: z.string().min(2).max(60),
    lastName: z.string().min(2).max(60),
    email: z.string().email().max(254),
    password: PasswordSchema,
    workspace: z.object({
        name: z.string().min(3).max(80),
        slug: z
            .string()
            .min(3)
            .max(40)
            .regex(
                /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
                "Slug must be lowercase letters, digits, or dashes"
            )
    })
});

export type RegisterOwnerDto = z.infer<typeof RegisterOwnerSchema>;

// Login.
export const LoginSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(128)
});

export type LoginDto = z.infer<typeof LoginSchema>;