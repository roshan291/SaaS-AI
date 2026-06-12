import bcrypt from "bcryptjs";

import {
    UserRepository
} from "@saas/db";

import {
    generateToken
} from "./jwt";

export class AuthService {

    async login(
        email: string,
        password: string
    ) {

        const user =
            await UserRepository.findByEmail(
                email
            );

        if (!user) {
            throw new Error(
                "Invalid credentials"
            );
        }

        const valid =
            await bcrypt.compare(
                password,
                user.passwordHash
            );

        if (!valid) {
            throw new Error(
                "Invalid credentials"
            );
        }

        const token =
            generateToken({
                userId: user._id,
                workspaceId:
                    user.workspaceId,
                role: user.role
            });

        return {
            token
        };
    }
    async me(
        userId: string,
        workspaceId: string
    ) {

        const user =
            await UserRepository.findByIdAndWorkspace(
                userId,
                workspaceId
            );

        if (!user) {
            throw new Error("User not found");
        }

        return {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            workspaceId: user.workspaceId
        };
    }
}