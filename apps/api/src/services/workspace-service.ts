import { WorkspaceRepository } from "@saas/db";

export class WorkspaceService {

  async createWorkspace(data: any) {

    const existing =
      await WorkspaceRepository.findBySlug(
        data.slug
      );

    if (existing) {
      throw new Error(
        "Workspace already exists"
      );
    }

    return WorkspaceRepository.create(
      data
    );
  }

  async getWorkspaces() {
    return WorkspaceRepository.getWorkspaces();
  }

  async updateWorkspace(
    id: string,
    data: any
  ) {

    return WorkspaceRepository.updateWorkspace(
      id,
      data
    );
  }

  async deleteWorkspace(
    id: string
  ) {

    return WorkspaceRepository.deleteWorkspace(
      id
    );
  }
}