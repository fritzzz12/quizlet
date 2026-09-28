import { randomUUID } from "crypto";
import { getDb, transaction } from "@/lib/db";
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

export function createUser(input: { name: string; email: string; passwordHash: string }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.name.trim(), input.email.toLowerCase(), input.passwordHash, createdAt);
  return id;
}

export function updateProfile(userId: string, name: string) {
  getDb().prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), userId);
}

export function updatePasswordHash(userId: string, passwordHash: string) {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export function updateSettings(userId: string, settings: { allowExternalKnowledge: boolean; defaultTimer: boolean }) {
  getDb()
    .prepare("UPDATE users SET allow_external_knowledge = ?, default_timer = ? WHERE id = ?")
    .run(settings.allowExternalKnowledge ? 1 : 0, settings.defaultTimer ? 1 : 0, userId);
}

export function insertLesson(input: Omit<LessonRow, "id" | "created_at"> & { id?: string }) {
  const id = input.id || randomUUID();
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO lessons (
        id, user_id, title, filename, file_path, file_size, page_count, extracted_text, summary,
        processing_status, content_status, failure_reason, word_count, concept_count, max_questions, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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
    );
  return id;
}

export function getLesson(id: string, userId: string): LessonRow | undefined {
  return getDb().prepare("SELECT * FROM lessons WHERE id = ? AND user_id = ?").get(id, userId) as LessonRow | undefined;
}

export function updateLessonTitle(id: string, userId: string, title: string) {
  const result = getDb().prepare("UPDATE lessons SET title = ? WHERE id = ? AND user_id = ?").run(title.trim(), id, userId);
  return result.changes > 0;
}

function lastScoreForLesson(lessonId: string, userId: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT percentage FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE q.lesson_id = ? AND a.user_id = ?
       ORDER BY a.completed_at DESC LIMIT 1`,
    )
    .get(lessonId, userId) as { percentage: number } | undefined;
  return row ? Math.round(row.percentage) : null;
}

function toLessonCard(row: LessonRow): LessonCard {
  const quizCount = (
    getDb().prepare("SELECT COUNT(*) AS count FROM quizzes WHERE lesson_id = ?").get(row.id) as { count: number }
  ).count;
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    fileSize: row.file_size,
    pageCount: row.page_count,
    summary: row.summary,
    processingStatus: row.processing_status,
    contentStatus: row.content_status,
    failureReason: row.failure_reason,
    wordCount: row.word_count,
    conceptCount: row.concept_count,
    maxQuestions: row.max_questions,
    quizCount,
    lastScore: lastScoreForLesson(row.id, row.user_id),
    createdAt: row.created_at,
  };
}

export function listLessons(userId: string): LessonCard[] {
  const rows = getDb().prepare("SELECT * FROM lessons WHERE user_id = ? ORDER BY created_at DESC").all(userId) as LessonRow[];
  return rows.map(toLessonCard);
}

export function getLessonCard(id: string, userId: string): LessonCard | null {
  const row = getLesson(id, userId);
  return row ? toLessonCard(row) : null;
}

export function lessonPages(row: LessonRow): string[] {
  return pagesFromStored(row.extracted_text);
}

export function deleteLesson(id: string, userId: string): LessonRow | null {
  const lesson = getLesson(id, userId);
  if (!lesson) return null;
  transaction(() => {
    const db = getDb();
    const quizIds = (db.prepare("SELECT id FROM quizzes WHERE lesson_id = ? AND user_id = ?").all(id, userId) as { id: string }[]).map((item) => item.id);
    for (const quizId of quizIds) deleteQuizRecords(quizId);
    db.prepare("DELETE FROM used_stems WHERE lesson_id = ?").run(id);
    db.prepare("DELETE FROM lessons WHERE id = ? AND user_id = ?").run(id, userId);
  });
  return lesson;
}

function deleteQuizRecords(quizId: string) {
  const db = getDb();
  const questionIds = (db.prepare("SELECT id, stem_key, lesson_id FROM questions WHERE quiz_id = ?").all(quizId) as { id: string; stem_key: string; lesson_id: string }[]);
  const attemptIds = (db.prepare("SELECT id FROM quiz_attempts WHERE quiz_id = ?").all(quizId) as { id: string }[]).map((item) => item.id);
  for (const attemptId of attemptIds) db.prepare("DELETE FROM user_answers WHERE attempt_id = ?").run(attemptId);
  db.prepare("DELETE FROM quiz_attempts WHERE quiz_id = ?").run(quizId);
  for (const question of questionIds) {
    db.prepare("DELETE FROM saved_questions WHERE question_id = ?").run(question.id);
    db.prepare("DELETE FROM choices WHERE question_id = ?").run(question.id);
    db.prepare("DELETE FROM used_stems WHERE lesson_id = ? AND stem_key = ?").run(question.lesson_id, question.stem_key);
  }
  db.prepare("DELETE FROM questions WHERE quiz_id = ?").run(quizId);
  db.prepare("DELETE FROM quizzes WHERE id = ?").run(quizId);
}

export function avoidQuestionTexts(lessonId: string): string[] {
  return (getDb().prepare("SELECT question_text FROM questions WHERE lesson_id = ? ORDER BY rowid DESC LIMIT 200").all(lessonId) as { question_text: string }[]).map(
    (row) => row.question_text,
  );
}

export function saveGeneratedQuiz(input: {
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
}): string {
  const quizId = randomUUID();
  const createdAt = new Date().toISOString();
  transaction(() => {
    const db = getDb();
    db.prepare(
      `INSERT INTO quizzes (
        id, user_id, lesson_id, title, mode, difficulty, difficulty_mix, question_types,
        question_count, engine, generation_note, allow_external, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
    );
    input.questions.forEach((question, index) => {
      const questionId = randomUUID();
      db.prepare(
        `INSERT INTO questions (
          id, quiz_id, lesson_id, order_index, question_text, question_type, difficulty, correct_answer,
          explanation, source_reference, source_excerpt, validation_status, statement_is_true,
          incorrect_phrase, correct_replacement, acceptable_answers, phrase_options, stem_key, concept_key, grounded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
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
      );
      question.choices.forEach((choice, choiceIndex) => {
        db.prepare("INSERT INTO choices (id, question_id, choice_text, is_correct, order_index) VALUES (?, ?, ?, ?, ?)").run(
          randomUUID(),
          questionId,
          choice.text,
          choice.isCorrect ? 1 : 0,
          choiceIndex,
        );
      });
      db.prepare("INSERT OR IGNORE INTO used_stems (lesson_id, stem_key) VALUES (?, ?)").run(input.lessonId, question.stemKey);
    });
  });
  return quizId;
}

function quizStats(quizId: string, userId: string) {
  const row = getDb()
    .prepare(
      `SELECT percentage, score,
        (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?) AS attempt_count
       FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? ORDER BY completed_at DESC LIMIT 1`,
    )
    .get(quizId, userId, quizId, userId) as { percentage: number; score: number; attempt_count: number } | undefined;
  return {
    lastScore: row ? row.score : null,
    lastPercentage: row ? Math.round(row.percentage) : null,
    attemptCount: row?.attempt_count || 0,
  };
}

function toQuizCard(row: QuizRow, userId: string): QuizCard {
  const stats = quizStats(row.id, userId);
  return {
    id: row.id,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title || "Lesson",
    title: row.title,
    mode: row.mode,
    difficulty: row.difficulty,
    mix: parseJson(row.difficulty_mix, { easy: 100, moderate: 0, hard: 0 }),
    questionTypes: parseJson<QuestionType[]>(row.question_types, []),
    questionCount: row.question_count,
    engine: row.engine,
    generationNote: row.generation_note,
    lastScore: stats.lastScore,
    lastPercentage: stats.lastPercentage,
    attemptCount: stats.attemptCount,
    createdAt: row.created_at,
  };
}

export function listQuizzes(userId: string, lessonId?: string): QuizCard[] {
  const rows = (lessonId
    ? getDb()
        .prepare(
          `SELECT q.*, l.title AS lesson_title FROM quizzes q JOIN lessons l ON l.id = q.lesson_id
           WHERE q.user_id = ? AND q.lesson_id = ? ORDER BY q.created_at DESC`,
        )
        .all(userId, lessonId)
    : getDb()
        .prepare(
          `SELECT q.*, l.title AS lesson_title FROM quizzes q JOIN lessons l ON l.id = q.lesson_id
           WHERE q.user_id = ? ORDER BY q.created_at DESC`,
        )
        .all(userId)) as QuizRow[];
  return rows.map((row) => toQuizCard(row, userId));
}

export function getQuizRow(id: string, userId: string): QuizRow | undefined {
  return getDb()
    .prepare(
      `SELECT q.*, l.title AS lesson_title FROM quizzes q JOIN lessons l ON l.id = q.lesson_id
       WHERE q.id = ? AND q.user_id = ?`,
    )
    .get(id, userId) as QuizRow | undefined;
}

export function getQuizCard(id: string, userId: string): QuizCard | null {
  const row = getQuizRow(id, userId);
  return row ? toQuizCard(row, userId) : null;
}

function questionsForQuiz(quizId: string): (QuestionRow & { choices: ChoiceRow[] })[] {
  const questions = getDb().prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index").all(quizId) as QuestionRow[];
  return questions.map((question) => ({
    ...question,
    choices: getDb().prepare("SELECT * FROM choices WHERE question_id = ? ORDER BY order_index").all(question.id) as ChoiceRow[],
  }));
}

export function publicQuiz(id: string, userId: string): { quiz: QuizCard; questions: PublicQuestion[] } | null {
  const quiz = getQuizCard(id, userId);
  if (!quiz) return null;
  const questions = questionsForQuiz(id).map((question) => ({
    id: question.id,
    order: question.order_index + 1,
    questionText: question.question_text,
    questionType: question.question_type,
    choices: question.choices.map((choice) => ({ id: choice.id, text: choice.choice_text })),
    phraseOptions: parseJson<string[]>(question.phrase_options, []),
  }));
  return { quiz, questions };
}

export function deleteQuiz(id: string, userId: string): boolean {
  const quiz = getQuizRow(id, userId);
  if (!quiz) return false;
  transaction(() => deleteQuizRecords(id));
  return true;
}

export function submitAttempt(input: {
  userId: string;
  quizId: string;
  answers: IncomingAnswer[];
  timeTakenSeconds: number | null;
  timerEnabled: boolean;
  startedAt: string;
}): { attemptId: string } | null {
  const quiz = getQuizRow(input.quizId, input.userId);
  if (!quiz) return null;
  const questions = questionsForQuiz(input.quizId);
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
  transaction(() => {
    const db = getDb();
    db.prepare(
      `INSERT INTO quiz_attempts (
        id, user_id, quiz_id, score, percentage, correct_count, incorrect_count, unanswered_count,
        time_taken_seconds, timer_enabled, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
    );
    for (const item of graded) {
      db.prepare("INSERT INTO user_answers (id, attempt_id, question_id, user_answer, is_correct) VALUES (?, ?, ?, ?, ?)").run(
        randomUUID(),
        attemptId,
        item.questionId,
        item.stored.kind === "unanswered" ? "" : JSON.stringify(item.stored),
        item.isCorrect ? 1 : 0,
      );
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

export function getAttempt(attemptId: string, userId: string): AttemptReview | null {
  const attempt = getDb()
    .prepare(
      `SELECT a.*, q.title AS quiz_title, q.lesson_id, l.title AS lesson_title
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE a.id = ? AND a.user_id = ?`,
    )
    .get(attemptId, userId) as
    | {
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
      }
    | undefined;
  if (!attempt) return null;
  const questions = questionsForQuiz(attempt.quiz_id);
  const answers = getDb().prepare("SELECT * FROM user_answers WHERE attempt_id = ?").all(attempt.id) as {
    question_id: string;
    user_answer: string;
    is_correct: number;
  }[];
  const saved = new Set(
    (getDb()
      .prepare(`SELECT question_id FROM saved_questions WHERE user_id = ? AND question_id IN (${questions.map(() => "?").join(",") || "''"})`)
      .all(userId, ...questions.map((question) => question.id)) as { question_id: string }[]).map((row) => row.question_id),
  );
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  const byDifficulty: AttemptReview["byDifficulty"] = {};
  const byType: AttemptReview["byType"] = {};
  const reviewQuestions: ReviewQuestion[] = questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    const shown = displayStoredAnswer(answer?.user_answer || "", question);
    const isCorrect = answer?.is_correct === 1;
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
      order: question.order_index + 1,
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
      grounded: question.grounded === 1,
      saved: saved.has(question.id),
    };
  });
  return {
    id: attempt.id,
    quizId: attempt.quiz_id,
    quizTitle: attempt.quiz_title,
    lessonId: attempt.lesson_id,
    lessonTitle: attempt.lesson_title,
    score: attempt.score,
    total: questions.length,
    percentage: Math.round(attempt.percentage),
    correctCount: attempt.correct_count,
    incorrectCount: attempt.incorrect_count,
    unansweredCount: attempt.unanswered_count,
    timeTakenSeconds: attempt.time_taken_seconds,
    timerEnabled: attempt.timer_enabled === 1,
    completedAt: attempt.completed_at,
    byDifficulty,
    byType,
    questions: reviewQuestions,
  };
}

export function listAttempts(userId: string) {
  return getDb()
    .prepare(
      `SELECT a.id, a.quiz_id, a.score, a.percentage, a.correct_count, a.time_taken_seconds, a.timer_enabled, a.completed_at,
              q.title AS quiz_title, q.question_count, q.difficulty, l.title AS lesson_title, l.id AS lesson_id
       FROM quiz_attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE a.user_id = ?
       ORDER BY a.completed_at DESC`,
    )
    .all(userId) as {
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
  }[];
}

export function setSaved(userId: string, questionId: string, saved: boolean): boolean {
  const owned = getDb()
    .prepare(
      `SELECT q.id FROM questions q
       JOIN quizzes z ON z.id = q.quiz_id
       WHERE q.id = ? AND z.user_id = ?`,
    )
    .get(questionId, userId) as { id: string } | undefined;
  if (!owned) return false;
  if (saved) {
    getDb()
      .prepare("INSERT OR IGNORE INTO saved_questions (id, user_id, question_id, created_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), userId, questionId, new Date().toISOString());
  } else {
    getDb().prepare("DELETE FROM saved_questions WHERE user_id = ? AND question_id = ?").run(userId, questionId);
  }
  return true;
}

export function listSaved(userId: string) {
  const rows = getDb()
    .prepare(
      `SELECT q.*, z.title AS quiz_title, l.title AS lesson_title, l.id AS lesson_id, s.created_at AS saved_at
       FROM saved_questions s
       JOIN questions q ON q.id = s.question_id
       JOIN quizzes z ON z.id = q.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC`,
    )
    .all(userId) as (QuestionRow & { quiz_title: string; lesson_title: string; lesson_id: string; saved_at: string })[];
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

export function dashboardFor(userId: string) {
  const lessons = listLessons(userId).slice(0, 4);
  const quizzes = listQuizzes(userId).slice(0, 4);
  const attempts = listAttempts(userId);
  const allLessons = listLessons(userId);
  const recentLessons = allLessons.slice(0, 3).map((lesson) => ({
    kind: "lesson" as const,
    id: lesson.id,
    title: lesson.title,
    detail: "Lesson uploaded",
    createdAt: lesson.createdAt,
  }));
  const recentQuizzes = listQuizzes(userId)
    .slice(0, 3)
    .map((quiz) => ({
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
    const rows = getDb()
      .prepare(
        `SELECT q.difficulty AS difficulty, SUM(ua.is_correct) AS correct, COUNT(*) AS total
         FROM user_answers ua
         JOIN quiz_attempts a ON a.id = ua.attempt_id
         JOIN questions q ON q.id = ua.question_id
         WHERE a.user_id = ?
         GROUP BY q.difficulty`,
      )
      .all(userId) as { difficulty: Difficulty; correct: number; total: number }[];
    for (const row of rows) {
      if (difficulty[row.difficulty]) difficulty[row.difficulty] = { correct: Number(row.correct) || 0, total: Number(row.total) || 0 };
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
      quizzes: listQuizzes(userId).length,
    },
  };
}
