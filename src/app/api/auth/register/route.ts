import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail, hashPassword, publicUser, setSessionCookie } from "@/lib/auth";
import { createUser } from "@/lib/store";
import { aiConfigured } from "@/lib/llm";
import { jsonError } from "@/lib/http";
import { getUserById } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (getUserByEmail(body.email)) return jsonError("An account with that email already exists.", 409);
    const id = createUser({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password) });
    await setSessionCookie(id);
    const user = getUserById(id);
    if (!user) return jsonError("Could not create the account.", 500);
    return NextResponse.json({ user: { ...publicUser(user), aiConfigured: aiConfigured() } });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("Use your name, a valid email, and a password of at least 8 characters.", 400);
    console.error(error);
    return jsonError("Could not create the account. Please try again.", 500);
  }
}
