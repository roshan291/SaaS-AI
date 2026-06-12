import bcrypt from "bcryptjs";

import {
  UserRepository
} from "@saas/db";

export class UserService {

  async createUser(data: any) {

    const existing =
      await UserRepository.findByEmail(
        data.email
      );

    if (existing) {
      throw new Error(
        "Email already exists"
      );
    }

    const passwordHash =
      await bcrypt.hash(
        data.password,
        10
      );

    const user =
      await UserRepository.create({
        workspaceId:
          data.workspaceId,

        firstName:
          data.firstName,

        lastName:
          data.lastName,

        email:
          data.email,

        passwordHash,

        role:
          data.role
      });

    return {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    };
  }

  async getUserById(
    userId: string,
    workspaceId: string
    ) {
    return UserRepository.findByIdAndWorkspace(
        userId,
        workspaceId
    );
}

  async getUsers(
    workspaceId: string
  ) {

    return UserRepository.findByWorkspace(
      workspaceId
    );
  }
  async updateUser(
  userId: string,
  workspaceId: string,
  data: any
) {

  return UserRepository.updateByWorkspace(
    userId,
    workspaceId,
    data
  );
}
async deleteUser(
  userId: string,
  workspaceId: string
) {

  return UserRepository.deleteByWorkspace(
    userId,
    workspaceId
  );
}
}

//Future: for getUsers
// TenantUserRepository.findAll(
//   req.user.workspaceId
// );
// Every query automatically becomes tenant-aware.