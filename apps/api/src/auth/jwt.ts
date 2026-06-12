import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET!;

export function generateToken(
  payload: any
) {
  return jwt.sign(
    payload,
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    } as jwt.SignOptions
  );
}

export function verifyToken(
  token: string
) {
  return jwt.verify(
    token,
    JWT_SECRET
  );
}