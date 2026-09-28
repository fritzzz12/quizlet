import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "folio_session";

const DEV_SECRET = "folio-dev-only-secret-do-not-use-in-production-32";

export function authSecret(): Uint8Array {
  const configured = process.env.AUTH_SECRET?.trim();
  const secret = configured && configured.length >= 16 ? configured : DEV_SECRET;
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(authSecret());
}

export async function readSession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
