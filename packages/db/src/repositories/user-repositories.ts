// import { BaseRepository } from "./base-repositories";
import { UserModel } from "../models/user";
import { TenantRepository } from "./tenant-repository";

class UserRepository extends TenantRepository<any> {

  constructor() {
    super(UserModel);
  }

  async findByEmail(email: string) {
    return this.model.findOne({
      email
    });
  }

  async findByWorkspace(
    workspaceId: string
  ) {
    return this.model.find({
      workspaceId
    });
  }
}

export default new UserRepository();