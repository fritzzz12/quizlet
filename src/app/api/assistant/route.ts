import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withUser } from "@/lib/http";
import { answerStudyQuestion } from "@/lib/assistant";
import { getLesson, lessonPages } from "@/lib/store";

const schema = z.object({
  lessonId: z.string().uuid(),
  question: z.string().trim().min(2).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(8).optional(),
});

export async function POST(request: Request) {
  return withUser(async (user) => {
    let body: z.infer<typeof schema>;
    try {
      body = schema.parse(await request.json());
    } catch {
      return jsonError("Enter a question about this lesson.", 400);
    }
    const lesson = getLesson(body.lessonId, user.id);
    if (!lesson) return jsonError("Lesson not found.", 404);
    if (lesson.content_status !== "readable") return jsonError(lesson.failure_reason || "This lesson has no readable text to study.", 422);
    const result = await answerStudyQuestion({
      title: lesson.title,
      pages: lessonPages(lesson),
      question: body.question,
      history: body.history || [],
      allowExternal: user.allow_external_knowledge === 1,
    });
    return NextResponse.json(result);
  });
}
