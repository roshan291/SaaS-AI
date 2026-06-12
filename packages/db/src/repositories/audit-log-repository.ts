import { BaseRepository }
from "./base-repositories";

import { AuditLogModel }
from "../models/audit-log";

class AuditLogRepository
extends BaseRepository<any> {

  constructor() {
    super(AuditLogModel);
  }

  // Paginated list scoped to a single workspace, newest first.
  async listForWorkspace(
    workspaceId: string,
    opts: { limit?: number; before?: Date; action?: string } = {}
  ) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const query: Record<string, unknown> = { workspaceId };
    if (opts.before) {
      query.createdAt = { $lt: opts.before };
    }
    if (opts.action) {
      query.action = opts.action;
    }

    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

export default new AuditLogRepository();