import { Schema, model } from "mongoose";

const AuditLogSchema = new Schema(
    {
      workspaceId: { type: String, required: true, index: true },
      userId: { type: String, index: true },
      action: { type: String, required: true },
      entity: { type: String },
      entityId: { type: String },
      metadata: { type: Schema.Types.Mixed },
      ip: { type: String },
      userAgent: { type: String }
    },
    {
      timestamps: true
    }
  );

// Audit log read patterns: list newest entries within a workspace, optionally
// filtered by actor or action.
AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
AuditLogSchema.index({ workspaceId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });

AuditLogSchema.set("toJSON", { versionKey: false });
AuditLogSchema.set("toObject", { versionKey: false });

export const AuditLogModel = model("AuditLog", AuditLogSchema);