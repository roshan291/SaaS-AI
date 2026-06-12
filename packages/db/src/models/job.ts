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

export const JobModel =
    model("Job", JobSchema);