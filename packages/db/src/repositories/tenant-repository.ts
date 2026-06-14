import { BaseRepository } from "./base-repositories";
import type { HydratedDocument } from "mongoose";

// Repository base for collections that ALWAYS carry a `workspaceId` field.
// All read/write helpers exposed here require the caller to pass the
// workspaceId, so cross-tenant leaks become a TypeScript compile error
// instead of a runtime bug.
//
// Subclasses must instantiate this with a Mongoose model whose schema
// includes a required, indexed `workspaceId: string` field.
//
// Note: Mongoose 9 stopped publicly exporting `FilterQuery<T>`. We use
// `Record<string, unknown>` at the .find() boundary; the public method
// signatures stay strongly-typed for callers.
export class TenantRepository<T extends { workspaceId?: string }>
  extends BaseRepository<T> {

  async findAllByWorkspace(
    workspaceId: string
  ): Promise<HydratedDocument<T>[]> {

    return this.model.find({ workspaceId } as Record<string, unknown>);
  }

  async findByIdAndWorkspace(
    id: string,
    workspaceId: string
  ): Promise<HydratedDocument<T> | null> {

    return this.model.findOne({
      _id: id,
      workspaceId
    } as Record<string, unknown>);
  }

  async updateByWorkspace(
    id: string,
    workspaceId: string,
    data: Partial<T>
  ): Promise<HydratedDocument<T> | null> {

    return this.model.findOneAndUpdate(
      { _id: id, workspaceId } as Record<string, unknown>,
      data,
      { new: true }
    );
  }

  async deleteByWorkspace(
    id: string,
    workspaceId: string
  ): Promise<HydratedDocument<T> | null> {

    return this.model.findOneAndDelete({
      _id: id,
      workspaceId
    } as Record<string, unknown>);
  }
}