import jwt from "jsonwebtoken";
import type { AuthUser } from "@saas/shared";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
const JWT_ISSUER = process.env.JWT_ISSUER ?? "saas-platform";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "saas-api";

// Fail fast at boot. A weak secret is the #1 way JWTs get forged, so we
// require ≥ 32 characters (256 bits when ASCII) and refuse to start without
// one configured.
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Generate one with `openssl rand -hex 64` and put it in the API .env."
  );
}
if (JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET is too short. Use at least 32 characters (recommend 64)."
  );
}

const SECRET: string = JWT_SECRET;

export interface JwtPayload extends AuthUser {
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export function generateToken(payload: AuthUser): string {
  return jwt.sign(payload, SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as JwtPayload).userId !== "string" ||
    typeof (decoded as JwtPayload).workspaceId !== "string" ||
    typeof (decoded as JwtPayload).role !== "string"
  ) {
    throw new Error("Malformed token payload");
  }

  return decoded as JwtPayload;
}
