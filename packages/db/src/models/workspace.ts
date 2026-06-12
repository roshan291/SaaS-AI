import { Schema, model } from "mongoose";

const WorkspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free"
    },

    ownerId: {
      type: String,
      required: true
    },

    isActive: {
      type: Boolean,
      default: true
    },

    settings: {
      timezone: {
        type: String,
        required: true
      },
      locale: {
        type: String,
        required: true
      }
    },
    usage: {
      postsGenerated: {
        type: Number,
        default: 0
      },
      aiCreditsUsed: {
        type: Number,
        default: 0
      }
    }
  },
  {
    timestamps: true
  }

);

export const WorkspaceModel = model("Workspace", WorkspaceSchema);