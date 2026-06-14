// packages/db/src/repositories/BaseRepository.ts
//
// Generic CRUD facade over a Mongoose `Model<T>`. Subclass it for
// document-specific queries; subclass `TenantRepository<T>` instead when the
// document is workspace-scoped (Post, Job, AuditLog, Media), so callers
// cannot accidentally read across tenants.

import type { Model, HydratedDocument } from "mongoose";

// Mongoose 9 doesn't export `FilterQuery` / `UpdateQuery` at the type level
// the way 6.x did, so we use looser shapes here. The runtime model still
// validates the shape; this is purely a TS wrapper.
type Filter<T> = Partial<T> & Record<string, unknown>;

export class BaseRepository<T> {
  constructor(protected model: Model<T>) {}

  async create(data: Partial<T>): Promise<HydratedDocument<T>> {
    return this.model.create(data);
  }

  async findById(id: string): Promise<HydratedDocument<T> | null> {
    return this.model.findById(id);
  }

  async findOne(
    filter: Filter<T>
  ): Promise<HydratedDocument<T> | null> {
    return this.model.findOne(filter);
  }

  async update(
    id: string,
    data: Partial<T>
  ): Promise<HydratedDocument<T> | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true });
  }

  /**
   * Returns *all* documents matched by `filter` (default: every document in
   * the collection). Cross-tenant by design — only call from tenant-scoped
   * subclasses or platform-level admin paths.
   */
  async findAll(
    filter: Filter<T> = {} as Filter<T>
  ): Promise<HydratedDocument<T>[]> {
    return this.model.find(filter);
  }

  async delete(id: string): Promise<HydratedDocument<T> | null> {
    return this.model.findByIdAndDelete(id);
  }
}