// packages/db/src/models/Post.ts

import { Schema, model } from "mongoose";

const PostSchema = new Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true
    },

    title: String,

    content: String,

    status: {
      type: String,
      enum: ["draft", "scheduled", "published"],
      default: "draft"
    }
  },
  {
    timestamps: true
  }
);

// Drafts list view + status filters within a workspace.
PostSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

PostSchema.set("toJSON", { versionKey: false });
PostSchema.set("toObject", { versionKey: false });

export const PostModel = model("Post", PostSchema);