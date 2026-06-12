import { Schema, model } from "mongoose";

const AuditLogSchema = new Schema(
    {
      workspaceId: String,
      userId: String,
      action: String,
      entity: String,
      entityId: String,
      metadata: Object
    },
    {
      timestamps: true
    }
  );

export const AuditLogModel = model("AuditLog", AuditLogSchema);