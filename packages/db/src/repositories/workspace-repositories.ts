import { BaseRepository } from "./base-repositories";
import { WorkspaceModel } from "../models/workspace";

class WorkspaceRepository extends BaseRepository<any> {

  constructor() {
    super(WorkspaceModel);
  }

  async findBySlug(slug: string) {

    return this.model.findOne({
      slug
    });
  }

  async getWorkspaces() {

    return this.findAll();
  }

  async updateWorkspace(
    id: string,
    data: any
  ) {

    return this.model.findByIdAndUpdate(
      id,
      data,
      {
        new: true
      }
    );
  }

  async deleteWorkspace(
    id: string
  ) {

    return this.model.findByIdAndDelete(
      id
    );
  }
}

export default new WorkspaceRepository();