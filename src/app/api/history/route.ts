import { NextResponse } from "next/server";
import { withUser } from "@/lib/http";
import { listAttempts } from "@/lib/store";

export async function GET() {
  return withUser(async (user) => NextResponse.json({ attempts: listAttempts(user.id) }));
}
