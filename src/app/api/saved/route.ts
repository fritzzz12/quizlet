import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withUser } from "@/lib/http";
import { listSaved, setSaved } from "@/lib/store";

export async function GET() {
  return withUser(async (user) => NextResponse.json({ questions: listSaved(user.id) }));
}

const schema = z.object({ questionId: z.string().uuid(), saved: z.boolean() });

export async function POST(request: Request) {
  return withUser(async (user) => {
    try {
      const body = schema.parse(await request.json());
      if (!setSaved(user.id, body.questionId, body.saved)) return jsonError("Question not found.", 404);
      return NextResponse.json({ ok: true });
    } catch {
      return jsonError("Could not update the saved question.", 400);
    }
  });
}
