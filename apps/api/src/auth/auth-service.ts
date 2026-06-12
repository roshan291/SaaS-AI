import bcrypt from "bcryptjs";

import { UserRepository, WorkspaceRepository } from "@saas/db";
import { toPublicUser } from "@saas/shared";
import { generateToken } from "./jwt";
import { Errors } from "../lib/respond";

const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 12);

interface RegisterOwnerInput {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    workspace: { name: string; slug: string };
}

export class AuthService {

    async login(email: string, password: string) {

        const user = await UserRepository.findByEmail(email);

        // Use a constant-time comparison even when the user is missing to
        // avoid timing side-channels that leak which emails are registered.
        const dummyHash =
            "$2a$12$abcdefghijklmnopqrstuuMcQ8sR.7zG7cQXPxJZmU6cWyMgpZL1u";
        const hash = user?.passwordHash ?? dummyHash;
        const valid = await bcrypt.compare(password, hash);

        if (!user || !valid || user.isActive === false) {
            throw Errors.unauthorized("Invalid credentials");
        }

        // Best-effort last-login bookkeeping; do not block the login on it.
        UserRepository.update(user._id.toString(), {
            lastLoginAt: new Date()
        }).catch(() => undefined);

        const token = generateToken({
            userId: user._id.toString(),
            workspaceId: user.workspaceId,
            role: user.role
        });

        return {
            token,
            user: toPublicUser(user)
        };
    }

    async me(userId: string, workspaceId: string) {
        const user = await UserRepository.findByIdAndWorkspace(
            userId,
            workspaceId
        );

        if (!user) {
            throw Errors.notFound("User");
        }

        return toPublicUser(user);
    }

    async registerOwner(input: RegisterOwnerInput) {
        // Slug uniqueness check first so we do not write a half-baked workspace.
        const slug = input.workspace.slug.toLowerCase().trim();
        const slugTaken = await WorkspaceRepository.findBySlug(slug);
        if (slugTaken) {
            throw Errors.conflict("Slug already in use", "SLUG_TAKEN");
        }

        // Email uniqueness check (collation handled by lowercase index on the
        // User schema).
        const existing = await UserRepository.findByEmail(input.email);
        if (existing) {
            throw Errors.conflict("Unable to create account", "EMAIL_TAKEN");
        }

        // Create workspace + owner. NOTE: this is not transactional because
        // Mongoose transactions require a replica set; if you upgrade Mongo to
        // a replica set, wrap this in a session.withTransaction(...) block.
        const workspace = await WorkspaceRepository.create({
            name: input.workspace.name,
            slug,
            ownerId: "pending",
            plan: "free",
            isActive: true,
            settings: { timezone: "UTC", locale: "en-US" },
            usage: { postsGenerated: 0, aiCreditsUsed: 0 }
        });

        try {
            const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

            const user = await UserRepository.create({
                workspaceId: workspace._id.toString(),
                firstName: input.firstName,
                lastName: input.lastName,
                email: input.email,
                passwordHash,
                role: "owner"
            });

            await WorkspaceRepository.updateWorkspace(workspace._id.toString(), {
                ownerId: user._id.toString()
            });

            const token = generateToken({
                userId: user._id.toString(),
                workspaceId: workspace._id.toString(),
                role: "owner"
            });

            return { token, user: toPublicUser(user) };
        } catch (err) {
            // Compensating delete so a half-created workspace does not linger.
            await WorkspaceRepository.deleteWorkspace(
                workspace._id.toString()
            ).catch(() => undefined);
            throw err;
        }
    }
}
