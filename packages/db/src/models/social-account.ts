// packages/db/src/models/social-account.ts
//
// A per-workspace OAuth connection to a single social platform account.
// Tokens are stored ENCRYPTED at rest — the encrypt/decrypt happens in the
// API service layer via @saas/integrations crypto helpers; the model only
// sees opaque ciphertext strings.

import { Schema, model } from "mongoose";

const SocialAccountSchema = new Schema(
  {
    // Tenant scope. Compound-unique with `platform` below so a workspace
    // can only have one connection per platform (matches Buffer / Hootsuite
    // mental model — re-connecting overwrites the existing row).
    workspaceId: { type: String, required: true, index: true },

    platform: {
      type: String,
      enum: ["instagram", "facebook", "x", "pinterest", "youtube"],
      required: true
    },

    // Identifier the platform uses for this account. For Instagram this is
    // the IG Business Account id; for X it's the user id; for Pinterest the
    // username; for YouTube the channel id.
    externalAccountId: { type: String, required: true },
    externalUsername: { type: String, default: null },

    // Encrypted via aes-256-gcm before reaching this layer. The model NEVER
    // stores plaintext tokens — see packages/integrations/src/crypto.ts.
    accessTokenCipher: { type: String, required: true },
    refreshTokenCipher: { type: String, default: null },

    // When the access token expires (per-platform; null = effectively long
    // lived / non-expiring like FB Page tokens). The worker checks this
    // before publishing and surfaces a "reconnect required" UI when stale.
    expiresAt: { type: Date, default: null },

    scopes: { type: [String], default: [] },

    // Per-platform extras that don't fit the common shape (page id for FB,
    // default board id for Pinterest, etc.). Free-form by design.
    metadata: { type: Schema.Types.Mixed, default: {} },

    // Audit who connected this — useful for "John connected the IG account
    // 3 weeks ago" in the UI.
    connectedByUserId: { type: String, default: null }
  },
  { timestamps: true }
);

// One connection per (workspace, platform). Reconnecting upserts.
SocialAccountSchema.index(
  { workspaceId: 1, platform: 1 },
  { unique: true }
);

SocialAccountSchema.set("toJSON", {
  versionKey: false,
  // Strip ciphertext fields from any accidental res.json(account). The API
  // service builds explicit DTOs anyway, but defence-in-depth never hurts.
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.accessTokenCipher;
    delete ret.refreshTokenCipher;
    return ret;
  }
});

export const SocialAccountModel = model("SocialAccount", SocialAccountSchema);
