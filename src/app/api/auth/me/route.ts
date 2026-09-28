import { NextResponse } from "next/server";
import { publicUser } from "@/lib/auth";
import { withUser } from "@/lib/http";
import { aiConfigured } from "@/lib/llm";

export async function GET() {
  return withUser(async (user) => NextResponse.json({ user: { ...publicUser(user), aiConfigured: aiConfigured() } }));
}
