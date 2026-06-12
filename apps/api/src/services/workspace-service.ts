import { WorkspaceRepository } from "@saas/db";
import { Errors } from "../lib/respond";

// Slugs that conflict with platform-level routes or are otherwise reserved.
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "console",
  "dashboard",
  "docs",
  "help",
  "internal",
  "platform",
  "public",
  "settings",
  "signup",
  "status",
  "support",
  "system",
  "www"
]);

interface CreateWorkspaceInput {
  name: string;
  slug: string;
  ownerId: string; // server-derived from JWT, never trusted from body
  settings: { timezone: string; locale: string };
}

export class WorkspaceService {
  async createWorkspace(data: CreateWorkspaceInput) {
    const slug = data.slug.toLowerCase().trim();

    if (RESERVED_SLUGS.has(slug)) {
      throw Errors.conflict("Slug is reserved", "RESERVED_SLUG");
    }

    const existing = await WorkspaceRepository.findBySlug(slug);
    if (existing) {
      throw Errors.conflict("Slug already in use", "SLUG_TAKEN");
    }

    return WorkspaceRepository.create({
      name: data.name,
      slug,
      ownerId: data.ownerId,
      plan: "free",
      isActive: true,
      settings: data.settings,
      usage: { postsGenerated: 0, aiCreditsUsed: 0 }
    });
  }

  // Used internally by the bootstrap (register-owner) flow and by `/me`.
  async getById(id: string) {
    return WorkspaceRepository.findById(id);
  }

  async getMine(ownerId: string) {
    return WorkspaceRepository.findByOwner(ownerId);
  }

  async updateWorkspace(
    id: string,
    data: Partial<{ name: string; settings: { timezone: string; locale: string } }>
  ) {
    return WorkspaceRepository.updateWorkspace(id, data);
  }

  async deleteWorkspace(id: string) {
    return WorkspaceRepository.deleteWorkspace(id);
  }
}
