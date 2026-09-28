import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withUser } from "@/lib/http";
import { submitAttempt } from "@/lib/store";

const schema = z.object({
  timeTakenSeconds: z.number().int().min(0).max(60 * 60 * 6).nullable().optional(),
  timerEnabled: z.boolean().optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedChoiceId: z.string().uuid().optional(),
        identification: z.string().max(200).optional(),
        verdict: z.enum(["true", "false"]).optional(),
        incorrectPhrase: z.string().max(180).optional(),
        correction: z.string().max(180).optional(),
      }),
    )
    .max(30),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    let body: z.infer<typeof schema>;
    try {
      body = schema.parse(await request.json());
    } catch {
      return jsonError("The quiz answers could not be read.", 400);
    }
    const elapsed = body.timeTakenSeconds ?? null;
    const result = submitAttempt({
      userId: user.id,
      quizId: id,
      answers: body.answers,
      timeTakenSeconds: elapsed,
      timerEnabled: Boolean(body.timerEnabled),
      startedAt: new Date(Date.now() - (elapsed || 0) * 1000).toISOString(),
    });
    if (!result) return jsonError("Quiz not found.", 404);
    return NextResponse.json(result);
  });
}
