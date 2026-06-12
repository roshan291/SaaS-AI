import { PostModel } from "../models/post";
import { TenantRepository } from "./tenant-repository";

class PostRepository extends TenantRepository<any> {

  constructor() {
    super(PostModel);
  }

  async findDrafts(
    workspaceId: string
  ) {
    return this.model.find({
      workspaceId,
      status: "draft"
    });
  }

  async findPublished(
    workspaceId: string
  ) {
    return this.model.find({
      workspaceId,
      status: "published"
    });
  }

  async findByStatus(
    workspaceId: string,
    status: "draft" | "scheduled" | "published"
  ) {
    return this.model.find({ workspaceId, status });
  }

   async publish(
    postId: string,
    workspaceId: string
  ) {

    return this.model.findOneAndUpdate(
      {
        _id: postId,
        workspaceId
      },
      {
        status: "published"
      },
      {
        new: true
      }
    );
  }
}

export default new PostRepository();