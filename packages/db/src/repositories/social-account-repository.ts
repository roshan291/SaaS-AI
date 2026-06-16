// packages/db/src/repositories/social-account-repository.ts

import { SocialAccountModel } from "../models/social-account";
import { TenantRepository } from "./tenant-repository";

class SocialAccountRepository extends TenantRepository<any> {
  constructor() {
    super(SocialAccountModel);
  }

  // Idempotent connect/reconnect — every OAuth callback upserts so users
  // can re-grant scopes without manually deleting the prior row first.
  async upsertForPlatform(
    workspaceId: string,
    platform: string,
    data: {
      externalAccountId: string;
      externalUsername?: string | null;
      accessTokenCipher: string;
      refreshTokenCipher?: string | null;
      expiresAt?: Date | null;
      scopes?: string[];
      metadata?: Record<string, unknown>;
      connectedByUserId?: string;
    }
  ) {
    return this.model.findOneAndUpdate(
      { workspaceId, platform },
      { workspaceId, platform, ...data },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async findByPlatform(workspaceId: string, platform: string) {
    return this.model.findOne({ workspaceId, platform });
  }

  async listByWorkspace(workspaceId: string) {
    return this.model.find({ workspaceId }).sort({ platform: 1 });
  }

  async disconnect(workspaceId: string, platform: string) {
    return this.model.findOneAndDelete({ workspaceId, platform });
  }
}

export default new SocialAccountRepository();
