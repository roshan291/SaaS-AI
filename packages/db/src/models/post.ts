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
      enum: ["draft", "scheduled", "published"]
    }
  },
  {
    timestamps: true
  }
);

export const PostModel = model("Post", PostSchema);