import { mkdirSync } from "fs";
import path from "path";
import type { DatabaseSync } from "node:sqlite";
import type postgres from "postgres";
import { ConfigError, postgresUrl } from "@/lib/config";

export type Sql = {
  one<T>(query: string, args?: unknown[]): Promise<T | undefined>;
  many<T>(query: string, args?: unknown[]): Promise<T[]>;
  run(query: string, args?: unknown[]): Promise<{ changes: number }>;
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      allow_external_knowledge INTEGER NOT NULL DEFAULT 0,
      default_timer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS lessons (
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
    )`,
  `CREATE TABLE IF NOT EXISTS quizzes (
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
    )`,
  `CREATE TABLE IF NOT EXISTS questions (
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
    )`,
  `CREATE TABLE IF NOT EXISTS choices (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      choice_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      order_index INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
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
    )`,
  `CREATE TABLE IF NOT EXISTS user_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      user_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS saved_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, question_id)
    )`,
  `CREATE TABLE IF NOT EXISTS used_stems (
      lesson_id TEXT NOT NULL,
      stem_key TEXT NOT NULL,
      PRIMARY KEY (lesson_id, stem_key)
    )`,
  `CREATE INDEX IF NOT EXISTS idx_lessons_user ON lessons(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, order_index)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id, completed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_answers_attempt ON user_answers(attempt_id)`,
];

type SqliteDb = DatabaseSync;

const globalForDb = globalThis as unknown as {
  folioSqlite?: SqliteDb;
  folioPostgres?: postgres.Sql;
  folioReady?: Promise<void>;
};

function values(args: unknown[] = []): import("node:sqlite").SQLInputValue[] {
  return args.map((value) => {
    if (value == null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
    if (value instanceof Uint8Array) return value;
    return String(value);
  });
}

function toPostgres(query: string) {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

function sqliteApi(db: SqliteDb): Sql {
  return {
    async one<T>(query: string, args: unknown[] = []) {
      return db.prepare(query).get(...values(args)) as T | undefined;
    },
    async many<T>(query: string, args: unknown[] = []) {
      return db.prepare(query).all(...values(args)) as T[];
    },
    async run(query: string, args: unknown[] = []) {
      const result = db.prepare(query).run(...values(args));
      return { changes: Number(result.changes) };
    },
  };
}

function postgresApi(sql: postgres.Sql | postgres.TransactionSql): Sql {
  return {
    async one<T>(query: string, args: unknown[] = []) {
      const rows = await sql.unsafe(toPostgres(query), values(args) as never[]);
      return rows[0] as T | undefined;
    },
    async many<T>(query: string, args: unknown[] = []) {
      const rows = await sql.unsafe(toPostgres(query), values(args) as never[]);
      return [...rows] as T[];
    },
    async run(query: string, args: unknown[] = []) {
      const rows = await sql.unsafe(toPostgres(query), values(args) as never[]);
      return { changes: Number(rows.count) };
    },
  };
}

let sqliteQueue: Promise<unknown> = Promise.resolve();

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = sqliteQueue.then(work, work);
  sqliteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function openSqlite() {
  const runtime = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const db = new runtime.DatabaseSync(path.join(dir, "folio.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  for (const statement of SCHEMA) db.exec(statement);
  globalForDb.folioSqlite = db;
}

async function openPostgres(url: string) {
  const { default: postgres } = await import("postgres");
  const local = /localhost|127\.0\.0\.1/.test(url);
  const sql = postgres(url, {
    ssl: local ? false : "require",
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  for (const statement of SCHEMA) await sql.unsafe(statement);
  globalForDb.folioPostgres = sql;
}

function ensureReady() {
  if (!globalForDb.folioReady) {
    globalForDb.folioReady = (async () => {
      const url = postgresUrl();
      if (process.env.VERCEL && !url) {
        throw new ConfigError("Add a Neon Postgres database in the Vercel project. Storage creates POSTGRES_URL, which Folio uses for lessons and quizzes.");
      }
      if (url) await openPostgres(url);
      else openSqlite();
    })().catch((error) => {
      globalForDb.folioReady = undefined;
      throw error;
    });
  }
  return globalForDb.folioReady;
}

async function connection(): Promise<Sql> {
  await ensureReady();
  if (globalForDb.folioPostgres) return postgresApi(globalForDb.folioPostgres);
  if (!globalForDb.folioSqlite) throw new ConfigError("The study database is not open.");
  const db = globalForDb.folioSqlite;
  return {
    one: (query, args) => exclusive(() => sqliteApi(db).one(query, args)),
    many: (query, args) => exclusive(() => sqliteApi(db).many(query, args)),
    run: (query, args) => exclusive(() => sqliteApi(db).run(query, args)),
  };
}

export async function one<T>(query: string, args?: unknown[]) {
  return (await connection()).one<T>(query, args);
}

export async function many<T>(query: string, args?: unknown[]) {
  return (await connection()).many<T>(query, args);
}

export async function run(query: string, args?: unknown[]) {
  return (await connection()).run(query, args);
}

export async function transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
  await ensureReady();
  if (globalForDb.folioPostgres) {
    const result = await globalForDb.folioPostgres.begin((tx) => work(postgresApi(tx)));
    return result as T;
  }
  const db = globalForDb.folioSqlite;
  if (!db) throw new ConfigError("The study database is not open.");
  return exclusive(async () => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = await work(sqliteApi(db));
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
