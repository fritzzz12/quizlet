import { randomUUID } from "crypto";
import { many, one, run, transaction, type Sql } from "@/lib/db";
import type { DraftQuestion } from "@/lib/validate";
import { answerIsBlank, evaluateAnswer, type IncomingAnswer } from "@/lib/score";
import type { Difficulty, QuestionType } from "@/lib/constants";
import type { AttemptReview, LessonCard, QuizCard, PublicQuestion, ReviewQuestion } from "@/lib/types";
import { pagesFromStored } from "@/lib/text";

type LessonRow = {
  id: string;
  user_id: string;
  title: string;
  filename: string;
  file_path: string;
  file_size: number;
  page_count: number;
  extracted_text: string;
  summary: string;
  processing_status: string;
  content_status: string;
  failure_reason: string | null;
  word_count: number;
  concept_count: number;
  max_questions: number;
  created_at: string;
};

type QuizRow = {
  id: string;
  user_id: string;
  lesson_id: string;
  title: string;
  mode: string;
  difficulty: string;
  difficulty_mix: string;
  question_types: string;
  question_count: number;
  engine: string;
  generation_note: string;
  allow_external: number;
  created_at: string;
  lesson_title?: string;
};

type QuestionRow = {
  id: string;
  quiz_id: string;
  lesson_id: string;
  order_index: number;
  question_text: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  correct_answer: string;
  explanation: string;
  source_reference: string;
  source_excerpt: string;
  validation_status: string;
  statement_is_true: number | null;
  incorrect_phrase: string | null;
  correct_replacement: string | null;
  acceptable_answers: string;
  phrase_options: string;
  stem_key: string;
  concept_key: string;
  grounded: number;
};

type ChoiceRow = { id: string; question_id: string; choice_text: string; is_correct: number; order_index: number };

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function num(value: unknown) {
  return Number(value) || 0;
}

export async function createUser(input: { name: string; email: string; passwordHash: string }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await run("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    input.name.trim(),
    input.email.toLowerCase(),
    input.passwordHash,
    createdAt,
  ]);
  return id;
}

export async function updateProfile(userId: string, name: string) {
  await run("UPDATE users SET name = ? WHERE id = ?", [name.trim(), userId]);
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
}

export async function updateSettings(userId: string, settings: { allowExternalKnowledge: boolean; defaultTimer: boolean }) {
  await run("UPDATE users SET allow_external_knowledge = ?, default_timer = ? WHERE id = ?", [
    settings.allowExternalKnowledge ? 1 : 0,
    settings.defaultTimer ? 1 : 0,
    userId,
  ]);
}

export async function insertLesson(input: Omit<LessonRow, "id" | "created_at"> & { id?: string }) {
  const id = input.id || randomUUID();
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO lessons (
        id, user_id, title, filename, file_path, file_size, page_count, extracted_text, summary,
        processing_status, content_status, failure_reason, word_count, concept_count, max_questions, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.user_id,
      input.title,
      input.filename,
      input.file_path,
      input.file_size,
      input.page_count,
      input.extracted_text,
      input.summary,
      input.processing_status,
      input.content_status,
      input.failure_reason,
      input.word_count,
      input.concept_count,
      input.max_questions,
      createdAt,
    ],
  );
  return id;
}

export async function getLesson(id: string, userId: string) {
  return one<LessonRow>("SELECT * FROM lessons WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function updateLessonTitle(id: string, userId: string, title: string) {
  const result = await run("UPDATE lessons SET title = ? WHERE id = ? AND user_id = ?", [title.trim(), id, userId]);
  return result.changes > 0;
}

async function lastScoreForLesson(lessonId: string, userId: string) {
  const row = await one<{ percentage: number }>(
    `SELECT percentage FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE q.lesson_id = ? AND a.user_id = ?
       ORDER BY a.completed_at DESC LIMIT 1`,
    [lessonId, userId],
  );
  return row ? Math.round(num(row.percentage)) : null;
}

async function toLessonCard(row: LessonRow): Promise<LessonCard> {
  const quizCount = await one<{ count: number }>("SELECT COUNT(*) AS count FROM quizzes WHERE lesson_id = ?", [row.id]);
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    fileSize: num(row.file_size),
    pageCount: num(row.page_count),
    summary: row.summary,
    processingStatus: row.processing_status,
    contentStatus: row.content_status,
    failureReason: row.failure_reason,
    wordCount: num(row.word_count),
    conceptCount: num(row.concept_count),
    maxQuestions: num(row.max_questions),
    quizCount: num(quizCount?.count),
    lastScore: await lastScoreForLesson(row.id, row.user_id),
    createdAt: row.created_at,
  };
}

export async function listLessons(userId: string) {
  const rows = await many<LessonRow>("SELECT * FROM lessons WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  const cards: LessonCard[] = [];
  for (const row of rows) cards.push(await toLessonCard(row));
  return cards;
}

export async function getLessonCard(id: string, userId: string) {
  const row = await getLesson(id, userId);
  return row ? toLessonCard(row) : null;
}

export function lessonPages(row: LessonRow) {
  return pagesFromStored(row.extracted_text);
}

async function deleteQuizRecords(db: Sql, quizId: string) {
  const questionIds = await db.many<{ id: string; stem_key: string; lesson_id: string }>(
    "SELECT id, stem_key, lesson_id FROM questions WHERE quiz_id = ?",
    [quizId],
  );
  const attemptIds = await db.many<{ id: string }>("SELECT id FROM quiz_attempts WHERE quiz_id = ?", [quizId]);
  for (const attempt of attemptIds) await db.run("DELETE FROM user_answers WHERE attempt_id = ?", [attempt.id]);
  await db.run("DELETE FROM quiz_attempts WHERE quiz_id = ?", [quizId]);
  for (const question of questionIds) {
    await db.run("DELETE FROM saved_questions WHERE question_id = ?", [question.id]);
    await db.run("DELETE FROM choices WHERE question_id = ?", [question.id]);
    await db.run("DELETE FROM used_stems WHERE lesson_id = ? AND stem_key = ?", [question.lesson_id, question.stem_key]);
  }
  await db.run("DELETE FROM questions WHERE quiz_id = ?", [quizId]);
  await db.run("DELETE FROM quizzes WHERE id = ?", [quizId]);
}

export async function deleteLesson(id: string, userId: string) {
  const lesson = await getLesson(id, userId);
  if (!lesson) return null;
  await transaction(async (db) => {
    const quizIds = await db.many<{ id: string }>("SELECT id FROM quizzes WHERE lesson_id = ? AND user_id = ?", [id, userId]);
    for (const quiz of quizIds) await deleteQuizRecords(db, quiz.id);
    await db.run("DELETE FROM used_stems WHERE lesson_id = ?", [id]);
    await db.run("DELETE FROM lessons WHERE id = ? AND user_id = ?", [id, userId]);
  });
  return lesson;
}

export async function avoidQuestionTexts(lessonId: string) {
  const rows = await many<{ question_text: string }>(
    `SELECT qn.question_text FROM questions qn
       JOIN quizzes q ON q.id = qn.quiz_id
       WHERE qn.lesson_id = ?
       ORDER BY q.created_at DESC, qn.order_index DESC
       LIMIT 200`,
    [lessonId],
  );
  return rows.map((row) => row.question_text);
}

export async function saveGeneratedQuiz(input: {
  userId: string;
  lessonId: string;
  title: string;
  mode: string;
  difficulty: string;
  mix: { easy: number; moderate: number; hard: number };
  types: QuestionType[];
  engine: string;
  note: string;
  allowExternal: boolean;
  questions: DraftQuestion[];
}) {
  const quizId = randomUUID();
  const createdAt = new Date().toISOString();
  await transaction(async (db) => {
    await db.run(
      `INSERT INTO quizzes (
        id, user_id, lesson_id, title, mode, difficulty, difficulty_mix, question_types,
        question_count, engine, generation_note, allow_external, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quizId,
        input.userId,
        input.lessonId,
        input.title,
        input.mode,
        input.difficulty,
        JSON.stringify(input.mix),
        JSON.stringify(input.types),
        input.questions.length,
        input.engine,
        input.note,
        input.allowExternal ? 1 : 0,
        createdAt,
      ],
    );
    for (const [index, question] of input.questions.entries()) {
      const questionId = randomUUID();
      await db.run(
        `INSERT INTO questions (
          id, quiz_id, lesson_id, order_index, question_text, question_type, difficulty, correct_answer,
          explanation, source_reference, source_excerpt, validation_status, statement_is_true,
          incorrect_phrase, correct_replacement, acceptable_answers, phrase_options, stem_key, concept_key, grounded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          questionId,
          quizId,
          input.lessonId,
          index,
          question.questionText,
          question.questionType,
          question.difficulty,
          question.correctAnswer,
          question.explanation,
          question.sourceReference,
          question.sourceExcerpt,
          "passed",
          question.statementIsTrue == null ? null : question.statementIsTrue ? 1 : 0,
          question.incorrectPhrase,
          question.correctReplacement,
          JSON.stringify(question.acceptableAnswers),
          JSON.stringify(question.phraseOptions),
          question.stemKey,
          question.conceptKey,
          question.grounded ? 1 : 0,
        ],
      );
      for (const [choiceIndex, choice] of question.choices.entries()) {
        await db.run("INSERT INTO choices (id, question_id, choice_text, is_correct, order_index) VALUES (?, ?, ?, ?, ?)", [
          randomUUID(),
          questionId,
          choice.text,
          choice.isCorrect ? 1 : 0,
          choiceIndex,
        ]);
      }
      await db.run("INSERT INTO used_stems (lesson_id, stem_key) VALUES (?, ?) ON CONFLICT (lesson_id, stem_key) DO NOTHING", [
        input.lessonId,
        question.stemKey,
      ]);
    }
  });
  return quizId;
}

async function quizStats(quizId: string, userId: string) {
  const row = await one<{ percentage: number; score: number; attempt_count: number }>(
    `SELECT percentage, score,
        (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?) AS attempt_count
       FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? ORDER BY completed_at DESC LIMIT 1`,
    [quizId, userId, quizId, userId],
  );
  return {
    lastScore: row ? num(row.score) : null,
    lastPercentage: row ? Math.round(num(row.percentage)) : null,
    attemptCount: row ? num(row.attempt_count) : 0,
  };
}

async function toQuizCard(row: QuizRow, userId: string): Promise<QuizCard> {
  const stats = await quizStats(row.id, userId);
  return {
    id: row.id,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title || "Lesson",
    title: row.title,
    mode: row.mode,
    difficulty: row.difficulty,
    mix: parseJson(row.difficulty_mix, { easy: 100, moderate: 0, hard: 0 }),
    questionTypes: parseJson<QuestionType[]>(row.question_types, []),
    questionCount: num(row.question_count),
    engine: row.engine,
    generationNote: row.generation_note,
    lastScore: stats.lastScore,
    lastPercentage: stats.lastPercentage,
    attemptCount: stats.attemptCount,
    createdAt: row.created_at,
  };
}

export async function listQuizzes(userId: string, lessonId?: string) {
  const rows = lessonId
    ? await many<QuizRow>(
        `SELECT q.*, l.title AS lesson_title FROM quizzes q JOIN lessons l ON l.id = q.lesson_id
           WHERE q.user_id = ? AND q.lesson_id = ? ORDER BY q.created_at DESC`,
        [userId, lessonId],
      )
    : await many<QuizRow>(
        `SELECT q.*, l.title AS lesson_title FROM quizzes q JOIN lessons l ON l.id = q.lesson_id
           WHERE q.user_id = ? ORDER BY q.created_at DESC`,
        [userId],
      );
  const cards: QuizCard[] = [];
  for (const row of rows) cards.push(await toQuizCard(row, userId));
  return cards;
}

export async function getQuizRow(id: string, userId: string) {
  return one<QuizRow>(
    `SELECT q.*, l.title AS lesson_title FROM quizzes q JOIN lessons l ON l.id = q.lesson_id
       WHERE q.id = ? AND q.user_id = ?`,
    [id, userId],
  );
}

export async function getQuizCard(id: string, userId: string) {
  const row = await getQuizRow(id, userId);
  return row ? toQuizCard(row, userId) : null;
}

async function questionsForQuiz(quizId: string) {
  const questions = await many<QuestionRow>("SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index", [quizId]);
  const withChoices: (QuestionRow & { choices: ChoiceRow[] })[] = [];
  for (const question of questions) {
    const choices = await many<ChoiceRow>("SELECT * FROM choices WHERE question_id = ? ORDER BY order_index", [question.id]);
    withChoices.push({ ...question, choices });
  }
  return withChoices;
}

export async function publicQuiz(id: string, userId: string): Promise<{ quiz: QuizCard; questions: PublicQuestion[] } | null> {
  const quiz = await getQuizCard(id, userId);
  if (!quiz) return null;
  const questions = (await questionsForQuiz(id)).map((question) => ({
    id: question.id,
    order: num(question.order_index) + 1,
    questionText: question.question_text,
    questionType: question.question_type,
    choices: question.choices.map((choice) => ({ id: choice.id, text: choice.choice_text })),
    phraseOptions: parseJson<string[]>(question.phrase_options, []),
  }));
  return { quiz, questions };
}

export async function deleteQuiz(id: string, userId: string) {
  const quiz = await getQuizRow(id, userId);
  if (!quiz) return false;
  await transaction((db) => deleteQuizRecords(db, id));
  return true;
}

export async function submitAttempt(input: {
  userId: string;
  quizId: string;
  answers: IncomingAnswer[];
  timeTakenSeconds: number | null;
  timerEnabled: boolean;
  startedAt: string;
}) {
  const quiz = await getQuizRow(input.quizId, input.userId);
  if (!quiz) return null;
  const questions = await questionsForQuiz(input.quizId);
  const attemptId = randomUUID();
  const completedAt = new Date().toISOString();
  const byId = new Map(input.answers.map((answer) => [answer.questionId, answer]));
  const graded = questions.map((question) => {
    const result = evaluateAnswer(
      {
        id: question.id,
        question_type: question.question_type,
        correct_answer: question.correct_answer,
        statement_is_true: question.statement_is_true,
        incorrect_phrase: question.incorrect_phrase,
        correct_replacement: question.correct_replacement,
        acceptable_answers: question.acceptable_answers,
        choices: question.choices,
      },
      byId.get(question.id),
    );
    return { questionId: question.id, ...result };
  });
  const correctCount = graded.filter((item) => item.isCorrect).length;
  const unansweredCount = graded.filter((item) => answerIsBlank(item.stored)).length;
  const incorrectCount = graded.length - correctCount - unansweredCount;
  const percentage = graded.length ? (correctCount / graded.length) * 100 : 0;
  await transaction(async (db) => {
    await db.run(
      `INSERT INTO quiz_attempts (
        id, user_id, quiz_id, score, percentage, correct_count, incorrect_count, unanswered_count,
        time_taken_seconds, timer_enabled, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attemptId,
        input.userId,
        input.quizId,
        correctCount,
        percentage,
        correctCount,
        incorrectCount,
        unansweredCount,
        input.timeTakenSeconds,
        input.timerEnabled ? 1 : 0,
        input.startedAt,
        completedAt,
      ],
    );
    for (const item of graded) {
      await db.run("INSERT INTO user_answers (id, attempt_id, question_id, user_answer, is_correct) VALUES (?, ?, ?, ?, ?)", [
        randomUUID(),
        attemptId,
        item.questionId,
        item.stored.kind === "unanswered" ? "" : JSON.stringify(item.stored),
        item.isCorrect ? 1 : 0,
      ]);
    }
  });
  return { attemptId };
}

function displayStoredAnswer(raw: string, question: QuestionRow): { text: string; unanswered: boolean } {
  if (!raw) return { text: "No answer", unanswered: true };
  try {
    const stored = JSON.parse(raw) as { kind: string; text?: string; verdict?: string; incorrectPhrase?: string; correction?: string };
    if (stored.kind === "multiple_choice" || stored.kind === "identification") return { text: stored.text || "No answer", unanswered: !stored.text };
    if (stored.kind === "modified_tf") {
      if (!stored.verdict) return { text: "No answer", unanswered: true };
      if (stored.verdict === "true") return { text: "True", unanswered: false };
      const phrase = stored.incorrectPhrase ? `“${stored.incorrectPhrase}”` : "no phrase selected";
      const correction = stored.correction ? `“${stored.correction}”` : "no correction";
      return { text: `False. Marked ${phrase} as incorrect and replaced it with ${correction}.`, unanswered: false };
    }
  } catch {
    return { text: raw, unanswered: false };
  }
  return { text: question.correct_answer ? raw : "No answer", unanswered: false };
}

export async function getAttempt(attemptId: string, userId: string): Promise<AttemptReview | null> {
  const attempt = await one<{
    id: string;
    quiz_id: string;
    score: number;
    percentage: number;
    correct_count: number;
    incorrect_count: number;
    unanswered_count: number;
    time_taken_seconds: number | null;
    timer_enabled: number;
    completed_at: string;
    quiz_title: string;
    lesson_id: string;
    lesson_title: string;
  }>(
    `SELECT a.*, q.title AS quiz_title, q.lesson_id, l.title AS lesson_title
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE a.id = ? AND a.user_id = ?`,
    [attemptId, userId],
  );
  if (!attempt) return null;
  const questions = await questionsForQuiz(attempt.quiz_id);
  const answers = await many<{ question_id: string; user_answer: string; is_correct: number }>(
    "SELECT * FROM user_answers WHERE attempt_id = ?",
    [attempt.id],
  );
  const savedRows = questions.length
    ? await many<{ question_id: string }>(
        `SELECT question_id FROM saved_questions WHERE user_id = ? AND question_id IN (${questions.map(() => "?").join(",")})`,
        [userId, ...questions.map((question) => question.id)],
      )
    : [];
  const saved = new Set(savedRows.map((row) => row.question_id));
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  const byDifficulty: AttemptReview["byDifficulty"] = {};
  const byType: AttemptReview["byType"] = {};
  const reviewQuestions: ReviewQuestion[] = questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    const shown = displayStoredAnswer(answer?.user_answer || "", question);
    const isCorrect = num(answer?.is_correct) === 1;
    byDifficulty[question.difficulty] ||= { correct: 0, total: 0 };
    byType[question.question_type] ||= { correct: 0, total: 0 };
    byDifficulty[question.difficulty].total += 1;
    byType[question.question_type].total += 1;
    if (isCorrect) {
      byDifficulty[question.difficulty].correct += 1;
      byType[question.question_type].correct += 1;
    }
    return {
      id: question.id,
      order: num(question.order_index) + 1,
      questionText: question.question_text,
      questionType: question.question_type,
      difficulty: question.difficulty,
      choices: question.choices.map((choice) => ({ id: choice.id, text: choice.choice_text })),
      phraseOptions: parseJson<string[]>(question.phrase_options, []),
      userAnswer: shown.text,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      sourceReference: question.source_reference,
      sourceExcerpt: question.source_excerpt,
      isCorrect,
      unanswered: shown.unanswered,
      grounded: num(question.grounded) === 1,
      saved: saved.has(question.id),
    };
  });
  return {
    id: attempt.id,
    quizId: attempt.quiz_id,
    quizTitle: attempt.quiz_title,
    lessonId: attempt.lesson_id,
    lessonTitle: attempt.lesson_title,
    score: num(attempt.score),
    total: questions.length,
    percentage: Math.round(num(attempt.percentage)),
    correctCount: num(attempt.correct_count),
    incorrectCount: num(attempt.incorrect_count),
    unansweredCount: num(attempt.unanswered_count),
    timeTakenSeconds: attempt.time_taken_seconds == null ? null : num(attempt.time_taken_seconds),
    timerEnabled: num(attempt.timer_enabled) === 1,
    completedAt: attempt.completed_at,
    byDifficulty,
    byType,
    questions: reviewQuestions,
  };
}

export async function listAttempts(userId: string) {
  const rows = await many<{
    id: string;
    quiz_id: string;
    score: number;
    percentage: number;
    correct_count: number;
    time_taken_seconds: number | null;
    timer_enabled: number;
    completed_at: string;
    quiz_title: string;
    question_count: number;
    difficulty: string;
    lesson_title: string;
    lesson_id: string;
  }>(
    `SELECT a.id, a.quiz_id, a.score, a.percentage, a.correct_count, a.time_taken_seconds, a.timer_enabled, a.completed_at,
              q.title AS quiz_title, q.question_count, q.difficulty, l.title AS lesson_title, l.id AS lesson_id
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE a.user_id = ?
       ORDER BY a.completed_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    ...row,
    score: num(row.score),
    percentage: num(row.percentage),
    correct_count: num(row.correct_count),
    question_count: num(row.question_count),
    timer_enabled: num(row.timer_enabled),
    time_taken_seconds: row.time_taken_seconds == null ? null : num(row.time_taken_seconds),
  }));
}

export async function setSaved(userId: string, questionId: string, saved: boolean) {
  const owned = await one<{ id: string }>(
    `SELECT q.id FROM questions q
       JOIN quizzes z ON z.id = q.quiz_id
       WHERE q.id = ? AND z.user_id = ?`,
    [questionId, userId],
  );
  if (!owned) return false;
  if (saved) {
    await run(
      "INSERT INTO saved_questions (id, user_id, question_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, question_id) DO NOTHING",
      [randomUUID(), userId, questionId, new Date().toISOString()],
    );
  } else {
    await run("DELETE FROM saved_questions WHERE user_id = ? AND question_id = ?", [userId, questionId]);
  }
  return true;
}

export async function listSaved(userId: string) {
  const rows = await many<QuestionRow & { quiz_title: string; lesson_title: string; lesson_id: string; saved_at: string }>(
    `SELECT q.*, z.title AS quiz_title, l.title AS lesson_title, l.id AS lesson_id, s.created_at AS saved_at
       FROM saved_questions s
       JOIN questions q ON q.id = s.question_id
       JOIN quizzes z ON z.id = q.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    quizTitle: row.quiz_title,
    lessonTitle: row.lesson_title,
    lessonId: row.lesson_id,
    questionText: row.question_text,
    questionType: row.question_type,
    difficulty: row.difficulty,
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    sourceReference: row.source_reference,
    sourceExcerpt: row.source_excerpt,
    savedAt: row.saved_at,
  }));
}

export async function dashboardFor(userId: string) {
  const lessons = (await listLessons(userId)).slice(0, 4);
  const quizzes = (await listQuizzes(userId)).slice(0, 4);
  const attempts = await listAttempts(userId);
  const allLessons = await listLessons(userId);
  const recentLessons = allLessons.slice(0, 3).map((lesson) => ({
    kind: "lesson" as const,
    id: lesson.id,
    title: lesson.title,
    detail: "Lesson uploaded",
    createdAt: lesson.createdAt,
  }));
  const recentQuizzes = (await listQuizzes(userId)).slice(0, 3).map((quiz) => ({
    kind: "quiz" as const,
    id: quiz.id,
    title: quiz.title,
    detail: `Quiz generated from ${quiz.lessonTitle}`,
    createdAt: quiz.createdAt,
  }));
  const recentAttempts = attempts.slice(0, 3).map((attempt) => ({
    kind: "attempt" as const,
    id: attempt.id,
    title: attempt.quiz_title,
    detail: `Scored ${attempt.correct_count}/${attempt.question_count}`,
    createdAt: attempt.completed_at,
    quizId: attempt.quiz_id,
  }));
  const activity = [...recentLessons, ...recentQuizzes, ...recentAttempts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);
  const answered = attempts.reduce((sum, attempt) => sum + attempt.question_count, 0);
  const average = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.percentage, 0) / attempts.length) : 0;
  const highest = attempts.length ? Math.max(...attempts.map((attempt) => Math.round(attempt.percentage))) : 0;
  const difficulty = { easy: { correct: 0, total: 0 }, moderate: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };
  if (attempts.length) {
    const rows = await many<{ difficulty: Difficulty; correct: number; total: number }>(
      `SELECT q.difficulty AS difficulty, SUM(ua.is_correct) AS correct, COUNT(*) AS total
         FROM user_answers ua
         JOIN quiz_attempts a ON a.id = ua.attempt_id
         JOIN questions q ON q.id = ua.question_id
         WHERE a.user_id = ?
         GROUP BY q.difficulty`,
      [userId],
    );
    for (const row of rows) {
      if (difficulty[row.difficulty]) difficulty[row.difficulty] = { correct: num(row.correct), total: num(row.total) };
    }
  }
  return {
    lessons,
    quizzes,
    activity,
    performance: {
      completed: attempts.length,
      average,
      highest,
      answered,
      byDifficulty: difficulty,
    },
    counts: {
      lessons: allLessons.length,
      quizzes: (await listQuizzes(userId)).length,
    },
  };
}
