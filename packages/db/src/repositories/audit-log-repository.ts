import { BaseRepository }
from "./base-repositories";

import { AuditLogModel }
from "../models/audit-log";

class AuditLogRepository
extends BaseRepository<any> {

  constructor() {
    super(AuditLogModel);
  }
}

export default new AuditLogRepository();