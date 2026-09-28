import { mkdirSync } from "fs";
import path from "path";
import type { DatabaseSync } from "node:sqlite";

function openDatabase(filename: string): DatabaseSync {
  const runtime = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  return new runtime.DatabaseSync(filename);
}

const globalForDb = globalThis as unknown as { folioDb?: DatabaseSync };

function schema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      allow_external_knowledge INTEGER NOT NULL DEFAULT 0,
      default_timer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      extracted_text TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      processing_status TEXT NOT NULL,
      content_status TEXT NOT NULL,
      failure_reason TEXT,
      word_count INTEGER NOT NULL DEFAULT 0,
      concept_count INTEGER NOT NULL DEFAULT 0,
      max_questions INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      difficulty_mix TEXT NOT NULL,
      question_types TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      engine TEXT NOT NULL,
      generation_note TEXT NOT NULL DEFAULT '',
      allow_external INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      source_excerpt TEXT NOT NULL,
      validation_status TEXT NOT NULL,
      statement_is_true INTEGER,
      incorrect_phrase TEXT,
      correct_replacement TEXT,
      acceptable_answers TEXT NOT NULL,
      phrase_options TEXT NOT NULL,
      stem_key TEXT NOT NULL,
      concept_key TEXT NOT NULL,
      grounded INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS choices (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      choice_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      percentage REAL NOT NULL,
      correct_count INTEGER NOT NULL,
      incorrect_count INTEGER NOT NULL,
      unanswered_count INTEGER NOT NULL,
      time_taken_seconds INTEGER,
      timer_enabled INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      user_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS used_stems (
      lesson_id TEXT NOT NULL,
      stem_key TEXT NOT NULL,
      PRIMARY KEY (lesson_id, stem_key)
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_user ON lessons(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id, completed_at);
    CREATE INDEX IF NOT EXISTS idx_answers_attempt ON user_answers(attempt_id);
  `);
}

export function getDb(): DatabaseSync {
  if (!globalForDb.folioDb) {
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const db = openDatabase(path.join(dir, "folio.db"));
    schema(db);
    globalForDb.folioDb = db;
  }
  return globalForDb.folioDb;
}

export function transaction<T>(work: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
