import { Schema, model } from "mongoose";

const UserSchema = new Schema(
    {
        workspaceId: {
            type: String,
            required: true,
            index: true
        },

        firstName: {
            type: String,
            required: true
        },

        lastName: {
            type: String,
            required: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            index: true
        },

        passwordHash: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: [
                "owner",
                "admin",
                "editor",
                "viewer"
            ],
            default: "viewer"
        },

        isActive: {
            type: Boolean,
            default: true
        },

        lastLoginAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

export const UserModel = model("User", UserSchema);