import {
  AuditLogRepository
} from "@saas/db";

export class AuditLogService {

  async log(data: any) {

    return AuditLogRepository.create(
      data
    );
  }
}