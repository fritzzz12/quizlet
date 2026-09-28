import { NextResponse } from "next/server";
import { jsonError, withUser } from "@/lib/http";
import { getAttempt } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    const attempt = getAttempt(id, user.id);
    if (!attempt) return jsonError("Result not found.", 404);
    return NextResponse.json({ attempt });
  });
}
