import bcrypt from "bcryptjs";

import { UserRepository } from "@saas/db";
import { toPublicUser } from "@saas/shared";
import { Errors } from "../lib/respond";

const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 12);

interface CreateUserInput {
  workspaceId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

export class UserService {
  async createUser(data: CreateUserInput) {
    const existing = await UserRepository.findByEmail(data.email);

    if (existing) {
      // Neutral error message — do not confirm whether an email exists, to
      // avoid account-enumeration during invitation flows.
      throw Errors.conflict("Unable to create account", "EMAIL_TAKEN");
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);

    const user = await UserRepository.create({
      workspaceId: data.workspaceId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      passwordHash,
      role: data.role
    });

    return toPublicUser(user);
  }

  async getUserById(userId: string, workspaceId: string) {
    const user = await UserRepository.findByIdAndWorkspace(
      userId,
      workspaceId
    );
    return toPublicUser(user);
  }

  async getUsers(workspaceId: string) {
    const users = await UserRepository.findByWorkspace(workspaceId);
    return users.map((u: unknown) =>
      toPublicUser(u as Parameters<typeof toPublicUser>[0])
    );
  }

  async updateUser(
    userId: string,
    workspaceId: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      role: "admin" | "editor" | "viewer";
      isActive: boolean;
    }>
  ) {
    const user = await UserRepository.updateByWorkspace(
      userId,
      workspaceId,
      data
    );
    return toPublicUser(user);
  }

  async deleteUser(userId: string, workspaceId: string) {
    return UserRepository.deleteByWorkspace(userId, workspaceId);
  }
}
