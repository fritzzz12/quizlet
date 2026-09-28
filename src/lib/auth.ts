import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { readSession, SESSION_COOKIE, signSession } from "@/lib/session";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  allow_external_knowledge: number;
  default_timer: number;
  created_at: string;
};

export class AuthError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    allowExternalKnowledge: Boolean(user.allow_external_knowledge),
    defaultTimer: Boolean(user.default_timer),
    createdAt: user.created_at,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function getUserById(id: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function getUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as UserRow | undefined;
}

export async function requireUser(): Promise<UserRow> {
  const jar = await cookies();
  const userId = await readSession(jar.get(SESSION_COOKIE)?.value);
  if (!userId) throw new AuthError();
  const user = getUserById(userId);
  if (!user) throw new AuthError();
  return user;
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge,
  };
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions(60 * 60 * 24 * 14));
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", sessionCookieOptions(0));
}

export async function currentUser(): Promise<UserRow | null> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return null;
    throw error;
  }
}
