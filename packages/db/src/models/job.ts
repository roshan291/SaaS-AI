import { Schema, model } from "mongoose";

const JobSchema = new Schema(
    {
        workspaceId: {
            type: String,
            required: true,
            index: true
        },

        type: {
            type: String,
            required: true
        },

        status: {
            type: String,
            enum: [
                "queued",
                "processing",
                "completed",
                "failed"
            ],
            default: "queued"
        },

        queueJobId: {
            type: String
        },

        payload: {
            type: Schema.Types.Mixed
        },

        result: {
            type: Schema.Types.Mixed
        },

        error: {
            type: String
        },

        startedAt: Date,

        completedAt: Date
    },
    {
        timestamps: true
    }
);

// Common access patterns:
//   - list jobs by workspace, newest first (job dashboard)
//   - filter by status within a workspace (stats / retry list)
JobSchema.index({ workspaceId: 1, createdAt: -1 });
JobSchema.index({ workspaceId: 1, status: 1 });

JobSchema.set("toJSON", { versionKey: false });
JobSchema.set("toObject", { versionKey: false });

export const JobModel =
    model("Job", JobSchema);