import { NextResponse } from "next/server";
import { AuthError, requireUser, type UserRow } from "@/lib/auth";
import { ConfigError } from "@/lib/config";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function withUser(handler: (user: UserRow) => Promise<Response>) {
  try {
    return await handler(await requireUser());
  } catch (error) {
    if (error instanceof AuthError) return jsonError("Please sign in.", 401);
    if (error instanceof ConfigError) return jsonError(error.message, 500);
    console.error(error);
    return jsonError("Something went wrong. Please try again.", 500);
  }
}
