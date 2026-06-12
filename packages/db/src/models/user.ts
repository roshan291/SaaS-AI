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

// Compound index for tenant-scoped user lookups.
UserSchema.index({ workspaceId: 1, role: 1 });

// Never leak password hash or Mongoose internals over the wire.
const userToJSON = {
    virtuals: true,
    versionKey: false,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret._id;
        return ret;
    }
};

UserSchema.set("toJSON", userToJSON);
UserSchema.set("toObject", userToJSON);

export const UserModel = model("User", UserSchema);