import { NextResponse } from "next/server";
import { jsonError, withUser } from "@/lib/http";
import { deleteQuiz, publicQuiz } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    const quiz = publicQuiz(id, user.id);
    if (!quiz) return jsonError("Quiz not found.", 404);
    return NextResponse.json(quiz);
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    if (!deleteQuiz(id, user.id)) return jsonError("Quiz not found.", 404);
    return NextResponse.json({ ok: true });
  });
}
