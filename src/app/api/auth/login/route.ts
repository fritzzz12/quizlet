import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, publicUser, setSessionCookie } from "@/lib/auth";
import { aiConfigured } from "@/lib/llm";
import { getUserByEmail } from "@/lib/auth";
import { jsonError } from "@/lib/http";

const schema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const user = await getUserByEmail(body.email);
    if (!user || !(await checkPassword(body.password, user.password_hash))) {
      return jsonError("Email or password is incorrect.", 401);
    }
    await setSessionCookie(user.id);
    return NextResponse.json({ user: { ...publicUser(user), aiConfigured: aiConfigured() } });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("Enter a valid email and password.", 400);
    console.error(error);
    return jsonError("Could not sign in. Please try again.", 500);
  }
}
