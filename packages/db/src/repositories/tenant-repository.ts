import { BaseRepository } from "./base-repositories";

export class TenantRepository<T>
  extends BaseRepository<T> {

  async findAllByWorkspace(
    workspaceId: string
  ) {

    return this.model.find({
      workspaceId
    });
  }

  async findByIdAndWorkspace(
    id: string,
    workspaceId: string
  ) {

    return this.model.findOne({
      _id: id,
      workspaceId
    });
  }

  async updateByWorkspace(
    id: string,
    workspaceId: string,
    data: Partial<T>
  ) {

    return this.model.findOneAndUpdate(
      {
        _id: id,
        workspaceId
      },
      data,
      {
        new: true
      }
    );
  }

  async deleteByWorkspace(
    id: string,
    workspaceId: string
  ) {

    return this.model.findOneAndDelete({
      _id: id,
      workspaceId
    });
  }
}