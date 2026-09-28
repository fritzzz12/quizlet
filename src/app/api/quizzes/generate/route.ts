import { NextResponse } from "next/server";
import { z } from "zod";
import { QUESTION_TYPES, type QuestionType } from "@/lib/constants";
import { jsonError, withUser } from "@/lib/http";
import { createQuestions } from "@/lib/llm";
import { allocateCounts } from "@/lib/generate";
import { avoidQuestionTexts, getLesson, lessonPages, saveGeneratedQuiz } from "@/lib/store";

const schema = z.object({
  lessonId: z.string().uuid(),
  mode: z.enum(["quick", "custom", "mixed"]),
  difficulty: z.enum(["easy", "moderate", "hard", "mixed"]).optional(),
  mix: z
    .object({
      easy: z.number().min(0).max(100),
      moderate: z.number().min(0).max(100),
      hard: z.number().min(0).max(100),
    })
    .optional(),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).max(3).optional(),
  count: z.number().int().min(1).max(30).optional(),
  topic: z.string().trim().max(80).optional(),
  allowExternal: z.boolean().optional(),
});

export async function POST(request: Request) {
  return withUser(async (user) => {
    let body: z.infer<typeof schema>;
    try {
      body = schema.parse(await request.json());
    } catch {
      return jsonError("Check the quiz settings and try again.", 400);
    }
    const lesson = getLesson(body.lessonId, user.id);
    if (!lesson) return jsonError("Lesson not found.", 404);
    if (lesson.content_status !== "readable" || lesson.processing_status !== "ready") {
      return jsonError(lesson.failure_reason || "This lesson cannot be used to generate a reliable quiz.", 422);
    }

    const types: QuestionType[] = body.mode === "quick" ? [...QUESTION_TYPES] : body.types?.length ? [...new Set(body.types)] : [];
    if (!types.length) return jsonError("Choose at least one question type.", 400);

    let difficulty = body.difficulty || "mixed";
    let mix = { easy: 40, moderate: 40, hard: 20 };
    if (body.mode === "custom") {
      if (!body.difficulty || body.difficulty === "mixed") return jsonError("Choose a difficulty for a custom quiz.", 400);
      difficulty = body.difficulty;
      mix = { easy: 0, moderate: 0, hard: 0, [body.difficulty]: 100 };
    } else if (body.mode === "mixed") {
      difficulty = "mixed";
      mix = body.mix || mix;
      const total = mix.easy + mix.moderate + mix.hard;
      if (Math.abs(total - 100) > 0.5) return jsonError("Difficulty percentages must add up to 100.", 400);
    }

    const requested = body.count ?? (body.mode === "quick" ? 10 : 5);
    const pages = lessonPages(lesson);
    const counts = allocateCounts(Math.min(requested, lesson.max_questions || requested), mix);
    const allowExternal = Boolean(body.allowExternal) && user.allow_external_knowledge === 1;
    const generated = await createQuestions({
      lessonText: lesson.extracted_text,
      pages,
      count: requested,
      types,
      difficultyCounts: counts,
      avoidTexts: avoidQuestionTexts(lesson.id),
      topic: body.topic,
      allowExternal,
    });
    if (!generated.questions.length) {
      return jsonError(generated.note || "No reliable questions could be created from this lesson.", 422);
    }
    const label = difficulty === "mixed" ? "Mixed" : difficulty[0].toUpperCase() + difficulty.slice(1);
    const title = body.topic ? `${lesson.title}: ${body.topic}` : `${lesson.title} · ${label}`;
    const quizId = saveGeneratedQuiz({
      userId: user.id,
      lessonId: lesson.id,
      title: title.slice(0, 140),
      mode: body.mode,
      difficulty,
      mix,
      types,
      engine: generated.engine,
      note: generated.note,
      allowExternal,
      questions: generated.questions,
    });
    return NextResponse.json({
      quizId,
      questionCount: generated.questions.length,
      note: generated.note,
      engine: generated.engine,
      maxSupported: lesson.max_questions,
    });
  });
}
