import { unlink } from "fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withUser } from "@/lib/http";
import { deleteLesson, getLesson, getLessonCard, listQuizzes, updateLessonTitle } from "@/lib/store";

const schema = z.object({ title: z.string().trim().min(1).max(120) });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    const lesson = getLessonCard(id, user.id);
    if (!lesson) return jsonError("Lesson not found.", 404);
    const full = getLesson(id, user.id);
    return NextResponse.json({
      lesson,
      preview: (full?.extracted_text || "").replace(/--- Page \d+ ---/g, "").trim().slice(0, 900),
      quizzes: listQuizzes(user.id, id),
    });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    try {
      const body = schema.parse(await request.json());
      if (!updateLessonTitle(id, user.id, body.title)) return jsonError("Lesson not found.", 404);
      return NextResponse.json({ ok: true });
    } catch {
      return jsonError("Enter a lesson title.", 400);
    }
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    const lesson = deleteLesson(id, user.id);
    if (!lesson) return jsonError("Lesson not found.", 404);
    await unlink(lesson.file_path).catch(() => undefined);
    return NextResponse.json({ ok: true });
  });
}
