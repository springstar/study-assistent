import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { DB_PATH } from "./config.ts";

export type Mistake = {
  sessionId: string;
  coreAbility: string;
  problemType: string;
  blockPoint: string;
  summary: string;
  keySteps: string;
  solution: string;
};

export function openDb(path = DB_PATH): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      problem_text TEXT NOT NULL,
      problem_image_path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      hint_level INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mistakes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      core_ability TEXT,
      problem_type TEXT,
      block_point TEXT,
      summary TEXT,
      key_steps TEXT,
      solution TEXT,
      mastered INTEGER NOT NULL DEFAULT 0,
      review_due_at TEXT,
      ef REAL NOT NULL DEFAULT 2.5,
      reps INTEGER NOT NULL DEFAULT 0,
      interval_days INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  // 兼容旧库：补缺列（重复列报错忽略）
  for (const col of ["ef REAL NOT NULL DEFAULT 2.5", "reps INTEGER NOT NULL DEFAULT 0", "interval_days INTEGER NOT NULL DEFAULT 0"]) {
    try {
      db.exec(`ALTER TABLE mistakes ADD COLUMN ${col}`);
    } catch {
      // 列已存在
    }
  }
  return db;
}

export function createSession(
  db: DatabaseSync,
  subject: string,
  problemText: string,
  imagePath: string | null = null,
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO sessions (id, subject, problem_text, problem_image_path, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, subject, problemText, imagePath, new Date().toISOString());
  return id;
}

export function saveTurn(
  db: DatabaseSync,
  sessionId: string,
  role: "student" | "assistant",
  content: string,
  hintLevel: number | null = null,
): void {
  db.prepare(
    "INSERT INTO turns (id, session_id, role, content, hint_level, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), sessionId, role, content, hintLevel, new Date().toISOString());
}

export function saveMistake(db: DatabaseSync, m: Mistake): string {
  const id = randomUUID();
  const now = new Date();
  // ponytail: SM-2 种子，首次复习定在 1 天后；完整间隔算法留第3步
  const due = new Date(now.getTime() + 24 * 3600 * 1000);
  db.prepare(
    `INSERT INTO mistakes
       (id, session_id, core_ability, problem_type, block_point, summary, key_steps, solution, mastered, review_due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    id, m.sessionId, m.coreAbility, m.problemType, m.blockPoint,
    m.summary, m.keySteps, m.solution, due.toISOString(), now.toISOString(),
  );
  return id;
}

export function getSimilar(db: DatabaseSync, problemType: string, limit = 5): any[] {
  return db
    .prepare("SELECT id, summary, block_point FROM mistakes WHERE problem_type = ? ORDER BY created_at DESC LIMIT ?")
    .all(problemType, limit);
}

/** 到期且未掌握的错题，连原题（problem_text/image）一起取，按到期时间升序 */
export function getDueMistakes(db: DatabaseSync, now = new Date()): any[] {
  return db
    .prepare(
      `SELECT m.*, s.problem_text, s.problem_image_path, s.subject
         FROM mistakes m JOIN sessions s ON s.id = m.session_id
        WHERE m.mastered = 0 AND m.review_due_at IS NOT NULL AND m.review_due_at <= ?
        ORDER BY m.review_due_at ASC`,
    )
    .all(now.toISOString());
}

/** 复习后更新调度（SM-2 结果 + 下次到期 + 是否掌握） */
export function updateSchedule(
  db: DatabaseSync,
  id: string,
  s: { ef: number; reps: number; interval: number },
  dueAt: Date,
  mastered: boolean,
): void {
  db.prepare(
    "UPDATE mistakes SET ef = ?, reps = ?, interval_days = ?, review_due_at = ?, mastered = ? WHERE id = ?",
  ).run(s.ef, s.reps, s.interval, dueAt.toISOString(), mastered ? 1 : 0, id);
}

export type MistakeFilter = { type?: string; unmasteredOnly?: boolean; dueOnly?: boolean };

/** 错题列表，支持按题型/未掌握/到期过滤，连原题一起取 */
export function getMistakes(db: DatabaseSync, f: MistakeFilter = {}, now = new Date()): any[] {
  const where: string[] = [];
  const params: any[] = [];
  if (f.type) {
    where.push("m.problem_type = ?");
    params.push(f.type);
  }
  if (f.unmasteredOnly) where.push("m.mastered = 0");
  if (f.dueOnly) {
    where.push("m.mastered = 0 AND m.review_due_at IS NOT NULL AND m.review_due_at <= ?");
    params.push(now.toISOString());
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT m.*, s.subject FROM mistakes m JOIN sessions s ON s.id = m.session_id
       ${clause} ORDER BY m.review_due_at ASC`,
    )
    .all(...params);
}

export type Stats = {
  total: number;
  mastered: number;
  dueNow: number;
  byType: { problem_type: string; count: number; unmastered: number }[];
  byAbility: { core_ability: string; count: number }[];
};

/** 会话列表（含回合数、错题数、最后活动时间），供历史页 */
export function listSessions(db: DatabaseSync): any[] {
  return db
    .prepare(
      `SELECT s.id, s.subject, s.problem_text, s.problem_image_path, s.created_at,
              (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id) AS turn_count,
              (SELECT COUNT(*) FROM mistakes m WHERE m.session_id = s.id) AS mistake_count
         FROM sessions s ORDER BY s.created_at DESC`,
    )
    .all();
}

/** 某会话的全部回合（按时间） */
export function getTurns(db: DatabaseSync, sessionId: string): any[] {
  return db
    .prepare("SELECT role, content, hint_level, created_at FROM turns WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId);
}

/** 错题库聚合统计 */
export function getStats(db: DatabaseSync, now = new Date()): Stats {
  const one = (sql: string, ...p: any[]) => (db.prepare(sql).get(...p) as any).c as number;
  return {
    total: one("SELECT COUNT(*) c FROM mistakes"),
    mastered: one("SELECT COUNT(*) c FROM mistakes WHERE mastered = 1"),
    dueNow: one(
      "SELECT COUNT(*) c FROM mistakes WHERE mastered = 0 AND review_due_at IS NOT NULL AND review_due_at <= ?",
      now.toISOString(),
    ),
    byType: db
      .prepare(
        `SELECT problem_type, COUNT(*) count, SUM(CASE WHEN mastered = 0 THEN 1 ELSE 0 END) unmastered
           FROM mistakes GROUP BY problem_type ORDER BY unmastered DESC, count DESC`,
      )
      .all() as any,
    byAbility: db
      .prepare("SELECT core_ability, COUNT(*) count FROM mistakes GROUP BY core_ability ORDER BY count DESC")
      .all() as any,
  };
}
