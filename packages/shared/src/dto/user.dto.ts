// Public-facing user DTO. The Mongoose schema also strips `passwordHash` via
// `toJSON`, but routes should still go through this sanitizer so the shape is
// explicit and the test surface is small.
export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  workspaceId: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type RawUser = {
  _id?: { toString(): string } | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  workspaceId?: string;
  isActive?: boolean;
  lastLoginAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  toJSON?: () => Record<string, unknown>;
};

export function toPublicUser(
  user: RawUser | null | undefined
): PublicUser | null {
  if (!user) return null;

  const raw =
    typeof user.toJSON === "function"
      ? user.toJSON()
      : (user as Record<string, unknown>);

  const id =
    typeof user._id === "string"
      ? user._id
      : user._id?.toString?.() ?? (raw._id as string | undefined) ?? "";

  return {
    id,
    firstName: (raw.firstName as string) ?? "",
    lastName: (raw.lastName as string) ?? "",
    email: (raw.email as string) ?? "",
    role:
      (raw.role as PublicUser["role"]) ??
      ("viewer" as PublicUser["role"]),
    workspaceId: (raw.workspaceId as string) ?? "",
    isActive: (raw.isActive as boolean) ?? true,
    lastLoginAt: raw.lastLoginAt
      ? new Date(raw.lastLoginAt as string | Date).toISOString()
      : null,
    createdAt: raw.createdAt
      ? new Date(raw.createdAt as string | Date).toISOString()
      : undefined,
    updatedAt: raw.updatedAt
      ? new Date(raw.updatedAt as string | Date).toISOString()
      : undefined
  };
}

export function toPublicUsers(
  users: Array<RawUser | null | undefined>
): PublicUser[] {
  return users
    .map((u) => toPublicUser(u))
    .filter((u): u is PublicUser => u !== null);
}
