import type { Difficulty, QuestionType } from "@/lib/constants";
import { generateGroundedQuestions, stemKey, type GenerateInput, type GenerateResult } from "@/lib/generate";
import { alphanumericCount } from "@/lib/text";
import { norm } from "@/lib/text";
import { validateDraft, type DraftQuestion } from "@/lib/validate";

export function aiConfigured(): boolean {
  return Boolean((process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "").trim());
}

function credentials() {
  return {
    apiKey: (process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "").trim(),
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

export function lessonPacket(pages: string[], limit = 14000): string {
  const joined = pages.map((page, index) => `--- Page ${index + 1} ---\n${page}`).join("\n\n");
  if (joined.length <= limit) return joined;
  const ranked = pages
    .map((text, index) => ({ index, text, score: alphanumericCount(text) }))
    .sort((a, b) => b.score - a.score);
  const chosen: { index: number; text: string }[] = [];
  let size = 0;
  for (const page of ranked) {
    if (size >= limit) break;
    chosen.push(page);
    size += page.text.length;
  }
  return chosen
    .sort((a, b) => a.index - b.index)
    .map((page) => `--- Page ${page.index + 1} ---\n${page.text}`)
    .join("\n\n")
    .slice(0, limit);
}

type RawQuestion = {
  question_text?: string;
  question_type?: QuestionType;
  difficulty?: Difficulty;
  correct_answer?: string;
  explanation?: string;
  source_reference?: string;
  source_excerpt?: string;
  choices?: string[];
  correct_choice_index?: number;
  statement_is_true?: boolean | null;
  incorrect_phrase?: string | null;
  correct_replacement?: string | null;
  acceptable_answers?: string[];
  phrase_options?: string[];
  grounded?: boolean;
};

function asDraft(raw: RawQuestion): DraftQuestion | null {
  if (!raw.question_text || !raw.question_type || !raw.difficulty || !raw.correct_answer || !raw.explanation || !raw.source_excerpt) return null;
  const choices = Array.isArray(raw.choices) ? raw.choices.map(String) : [];
  let mappedChoices: { text: string; isCorrect: boolean }[] = [];
  let correctAnswer = String(raw.correct_answer);
  if (raw.question_type === "multiple_choice") {
    if (choices.length !== 4 || raw.correct_choice_index == null || raw.correct_choice_index < 0 || raw.correct_choice_index > 3) return null;
    mappedChoices = choices.map((text, index) => ({ text, isCorrect: index === raw.correct_choice_index }));
    correctAnswer = choices[raw.correct_choice_index];
  }
  return {
    questionText: String(raw.question_text),
    questionType: raw.question_type,
    difficulty: raw.difficulty,
    correctAnswer,
    explanation: String(raw.explanation),
    sourceReference: String(raw.source_reference || "Lesson"),
    sourceExcerpt: String(raw.source_excerpt),
    statementIsTrue: raw.statement_is_true ?? null,
    incorrectPhrase: raw.incorrect_phrase ?? null,
    correctReplacement: raw.correct_replacement ?? null,
    acceptableAnswers: Array.isArray(raw.acceptable_answers) ? raw.acceptable_answers.map(String) : [correctAnswer],
    choices: mappedChoices,
    phraseOptions: Array.isArray(raw.phrase_options) ? raw.phrase_options.map(String) : [],
    stemKey: stemKey(String(raw.question_text)),
    conceptKey: norm(correctAnswer).slice(0, 80),
    grounded: raw.grounded !== false,
  };
}

export async function chatCompletion(messages: { role: string; content: string }[], json = false): Promise<string> {
  const { apiKey, baseUrl, model } = credentials();
  const body: Record<string, unknown> = { model, temperature: 0.2, messages };
  if (json) body.response_format = { type: "json_object" };
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(50000),
  });
  if (!response.ok && json) return chatCompletion(messages, false);
  if (!response.ok) throw new Error("The language model request failed.");
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The language model returned an empty response.");
  return content;
}

export async function generateWithModel(input: GenerateInput): Promise<GenerateResult> {
  const counts = input.difficultyCounts;
  const externalRule = input.allowExternal
    ? "You may add at most one question that uses general knowledge. Mark it grounded false and set source_reference to Beyond the lesson."
    : "Every question, answer, distractor, and excerpt must be supported by the lesson. Do not add outside facts.";
  const content = await chatCompletion(
    [
      {
        role: "system",
        content:
          "You write lesson-grounded quiz questions and return JSON only. Never invent facts that are not in the lesson. " +
          "Difficulty must come from cognitive demand: easy is direct recall, moderate compares or interprets, hard distinguishes close concepts or combines two lesson constraints. " +
          "Multiple choice has exactly four choices and one correct index. Modified true/false uses a statement. If it is false, name the incorrect phrase that appears in the statement and the replacement supported by the lesson. " +
          "Identification questions must not contain the answer. Excerpts must be copied from the lesson.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create quiz questions from this lesson only.",
          rules: externalRule,
          count: input.count,
          types: input.types,
          difficulty_counts: counts,
          avoid_similar_questions: input.avoidTexts.slice(0, 30),
          topic: input.topic || null,
          lesson: lessonPacket(input.pages),
          json_shape: {
            questions: [
              {
                question_text: "",
                question_type: "multiple_choice | modified_tf | identification",
                difficulty: "easy | moderate | hard",
                correct_answer: "",
                explanation: "",
                source_reference: "Page 1",
                source_excerpt: "exact lesson quote",
                choices: ["only for multiple choice"],
                correct_choice_index: 0,
                statement_is_true: true,
                incorrect_phrase: null,
                correct_replacement: null,
                acceptable_answers: [],
                phrase_options: [],
                grounded: true,
              },
            ],
          },
        }),
      },
    ],
    true,
  );
  const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || content) as { questions?: RawQuestion[] };
  const accepted: DraftQuestion[] = [];
  const used = [...input.avoidTexts];
  for (const raw of parsed.questions || []) {
    const draft = asDraft(raw);
    if (!draft) continue;
    if (!input.types.includes(draft.questionType)) continue;
    if (!counts[draft.difficulty]) continue;
    const reasons = validateDraft(draft, input.lessonText, used, Boolean(input.allowExternal));
    if (reasons.length) continue;
    accepted.push(draft);
    used.push(draft.questionText);
    if (accepted.length >= input.count) break;
  }
  return {
    questions: accepted,
    note: accepted.length ? "Questions were drafted by the language model and kept only when they matched the lesson." : "",
    engine: "language_model",
    conceptCount: 0,
    maxSupported: input.count,
  };
}

export async function createQuestions(input: GenerateInput): Promise<GenerateResult> {
  if (!aiConfigured()) return generateGroundedQuestions(input);
  try {
    const modeled = await generateWithModel(input);
    if (modeled.questions.length >= input.count) return modeled;
    if (!modeled.questions.length) {
      const local = generateGroundedQuestions(input);
      return { ...local, note: `The language model did not return usable questions. ${local.note}`.trim() };
    }
    const fill = generateGroundedQuestions({
      ...input,
      count: input.count - modeled.questions.length,
      avoidTexts: [...input.avoidTexts, ...modeled.questions.map((question) => question.questionText)],
    });
    return {
      questions: [...modeled.questions, ...fill.questions],
      note: [modeled.note, fill.note].filter(Boolean).join(" "),
      engine: "language_model",
      conceptCount: fill.conceptCount,
      maxSupported: fill.maxSupported,
    };
  } catch {
    const local = generateGroundedQuestions(input);
    return { ...local, note: `The language model was unavailable, so Folio used the lesson text directly. ${local.note}`.trim() };
  }
}
