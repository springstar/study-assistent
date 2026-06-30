import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import {
  openDb, createSession, saveTurn, saveMistake, getSimilar,
  getStats, getMistakes, getDueMistakes, updateSchedule, listSessions, getTurns, setSessionProblem,
} from "./db.ts";
import { createTutor, ask, buildMessagesFromTurns } from "./tutor.ts";
import { evaluate, type Turn, type Verdict } from "./evaluator.ts";
import { genSpec } from "./vizspec.ts";
import { summarizeMistake, toQuality } from "./archive.ts";
import { sm2, MASTERED_INTERVAL } from "./sm2.ts";
import { SUBJECTS, resolveSubject, DEFAULT_SUBJECT, supportedSubjects } from "./subjects.ts";
import { ROOT, TUTOR_MODEL, EVAL_MODEL } from "./config.ts";

const PORT = Number(process.env.PORT) || 8787;
const DIST = join(ROOT, "viewer", "dist");
const db = openDb();

type Sess = {
  agent: ReturnType<typeof createTutor>;
  transcript: Turn[];
  pendingGaps: string[];
  subject: string;
  isReview: boolean;
  persist: boolean;
  sessionId: string; // DB session id（复习时为原题会话）
  lastVerdict: Verdict | null;
  started: boolean; // 是否已发过首条（题目）消息
  specDone: boolean; // 是否已生成过可视化（一次会话最多一次）
};
const sessions = new Map<string, Sess>();

const GAP_NOTE = (gaps: string[]) =>
  `\n\n[系统给老师的私下提示，不要直接告诉学生：评估发现学生当前仍有这些理解缺口——${gaps.join("；")}。请围绕其中最关键的一点设计你的下一个引导问题，逐步逼近，绝不直接点破。]`;

// ---- HTTP helpers ----
function json(res: ServerResponse, code: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}
function sseHead(res: ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}
function sse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
};

// ---- one tutoring turn over SSE ----
async function streamTurn(
  res: ServerResponse,
  sess: Sess,
  text: string,
  images: ImageContent[] | undefined,
  opts: { saveStudent: boolean; runEval: boolean; runSpec: boolean },
) {
  sseHead(res);
  const studentText = text || (images ? "[图片题目]" : "");
  // 图片题若学生没打字，补明确指令——否则空 user 消息+图会让模型乱回
  const effectiveText = text || (images ? "请看图片里的题目，先把你识别到的题目完整转写出来（公式用 LaTeX），问我确认对不对，确认后再开始引导。" : "");
  const promptText =
    sess.pendingGaps.length && opts.runEval && sess.started ? effectiveText + GAP_NOTE(sess.pendingGaps) : effectiveText;
  try {
    const isFirstTurn = !sess.started;
    const reply = await ask(sess.agent, promptText, { images, onDelta: (d) => sse(res, "delta", { text: d }) });
    if (opts.saveStudent) {
      if (sess.persist) saveTurn(db, sess.sessionId, "student", studentText);
      sess.transcript.push({ role: "student", content: studentText });
    }
    // 首轮回填题目到 session：文字题用学生原文，图片题用老师转写(回复含识别出的题目)
    if (isFirstTurn && sess.persist && !sess.isReview) {
      const problemText = text || (images ? reply.slice(0, 500) : "");
      setSessionProblem(db, sess.sessionId, problemText, images ? "[图片]" : null);
    }
    if (sess.persist) saveTurn(db, sess.sessionId, "assistant", reply);
    sess.transcript.push({ role: "assistant", content: reply });

    if (opts.runEval) {
      const v = await evaluate(sess.transcript);
      sess.lastVerdict = v;
      sess.pendingGaps = v.understood ? [] : v.gaps;
      sse(res, "verdict", v);
    }
    if (opts.runSpec && !sess.specDone && !sess.isReview && SUBJECTS[sess.subject].viz) {
      const spec = await genSpec(text, sess.subject, images);
      if (spec) {
        sess.specDone = true;
        sse(res, "spec", spec);
      }
    }
    sess.started = true;
    sse(res, "done", { reply });
  } catch (e) {
    sse(res, "error", { message: (e as Error).message });
  }
  res.end();
}

function imagesFrom(body: any): ImageContent[] | undefined {
  if (!body?.imageBase64) return undefined;
  return [{ type: "image", data: body.imageBase64, mimeType: body.imageMime || "image/png" }];
}

// ---- route handlers ----
async function handleSession(res: ServerResponse, body: any) {
  const subject = resolveSubject(body?.subject || "") ?? DEFAULT_SUBJECT;
  const sessionId = createSession(db, subject, "", null);
  sessions.set(sessionId, {
    agent: createTutor(subject),
    transcript: [],
    pendingGaps: [],
    subject,
    isReview: false,
    persist: true,
    sessionId,
    lastVerdict: null,
    started: false,
    specDone: false,
  });
  json(res, 200, { sessionId, subject });
}

/** 加载历史会话进内存：重建 Agent(灌历史 messages) + transcript，可继续发消息 */
async function handleLoad(res: ServerResponse, body: any) {
  const sessionId = body?.sessionId;
  const s: any = db.prepare("SELECT subject FROM sessions WHERE id = ?").get(sessionId);
  if (!s) return json(res, 404, { error: "会话不存在" });
  const subject = resolveSubject(s.subject) ?? DEFAULT_SUBJECT;
  const turns: any[] = getTurns(db, sessionId);
  const agent = createTutor(subject);
  const simpleTurns: { role: "student" | "assistant"; content: string; ts?: number }[] = turns.map((t) => ({
    role: (t.role === "assistant" ? "assistant" : "student") as "student" | "assistant",
    content: t.content,
    ts: Date.parse(t.created_at),
  }));
  // 灌历史让 Agent 记住上下文
  agent.state.messages = buildMessagesFromTurns(simpleTurns);
  const transcript = simpleTurns.map((t) => ({ role: t.role, content: t.content }));
  sessions.set(sessionId, {
    agent,
    transcript,
    pendingGaps: [],
    subject,
    isReview: false,
    persist: true,
    sessionId,
    lastVerdict: null,
    started: true,
    specDone: true,
  });
  json(res, 200, { sessionId, subject, turns: simpleTurns });
}

async function handleArchive(res: ServerResponse, body: any) {
  const sess = sessions.get(body?.sessionId);
  if (!sess) return json(res, 404, { error: "会话不存在" });
  const fields = await summarizeMistake(sess.transcript, sess.subject);
  const id = saveMistake(db, { sessionId: sess.sessionId, ...fields });
  const similar = getSimilar(db, fields.problemType);
  json(res, 200, { id, ...fields, similarCount: similar.length });
}

async function handleReviewStart(res: ServerResponse, body: any) {
  const m: any = db
    .prepare(
      `SELECT m.*, s.problem_text, s.problem_image_path, s.subject
         FROM mistakes m JOIN sessions s ON s.id = m.session_id WHERE m.id = ?`,
    )
    .get(body?.mistakeId);
  if (!m) return json(res, 404, { error: "错题不存在" });
  const subject = resolveSubject(m.subject) ?? DEFAULT_SUBJECT;
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    agent: createTutor(subject),
    transcript: [],
    pendingGaps: [],
    subject,
    isReview: true,
    persist: false,
    sessionId,
    lastVerdict: null,
    started: false,
    specDone: false,
  });
  const seed = m.problem_text
    ? `这是我之前做错的题，请你引导我重新做一遍（先问我思路，别直接给答案）：\n${m.problem_text}`
    : "这是我之前做错的题，请你引导我重新做一遍，先问我思路，别直接给答案。";
  json(res, 200, { sessionId, seedText: seed, summary: m.summary, blockPoint: m.block_point });
}

function handleReviewGrade(res: ServerResponse, body: any) {
  const sess = sessions.get(body?.sessionId);
  const m: any = db.prepare("SELECT ef, reps, interval_days FROM mistakes WHERE id = ?").get(body?.mistakeId);
  if (!sess || !m) return json(res, 404, { error: "会话或错题不存在" });
  const q = toQuality(sess.lastVerdict);
  const sched = sm2({ ef: m.ef, reps: m.reps, interval: m.interval_days }, q);
  const due = new Date(Date.now() + sched.interval * 24 * 3600 * 1000);
  const mastered = sched.interval >= MASTERED_INTERVAL;
  updateSchedule(db, body.mistakeId, sched, due, mastered);
  json(res, 200, { quality: q, dueAt: due.toISOString(), interval: sched.interval, mastered });
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (!existsSync(DIST)) {
    return json(res, 200, { ok: true, hint: "API 运行中。前端开发请另起 viewer Vite (npm run dev)。" });
  }
  let p = (req.url || "/").split("?")[0];
  if (p === "/") p = "/index.html";
  const file = join(DIST, p);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    // SPA 回退
    const idx = await readFile(join(DIST, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(idx);
  }
  const data = await readFile(file);
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(data);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || "GET";
  try {
    if (!path.startsWith("/api/")) return serveStatic(req, res);

    if (method === "GET" && path === "/api/subjects") return json(res, 200, { subjects: supportedSubjects() });
    if (method === "GET" && path === "/api/status")
      return json(res, 200, { tutor: TUTOR_MODEL, evaluator: EVAL_MODEL });

    if (method === "POST" && path === "/api/session") return handleSession(res, await readJson(req));
    if (method === "POST" && path === "/api/session/load") return handleLoad(res, await readJson(req));

    if (method === "POST" && path === "/api/message") {
      const body = await readJson(req);
      const sess = sessions.get(body?.sessionId);
      if (!sess) return json(res, 404, { error: "会话不存在" });
      const isFirst = !sess.started;
      const images = imagesFrom(body);
      // 每轮都尝试生成 spec（specDone 保证只画一次）。立体几何/函数题在首轮转写时即出图，帮助确认题目。
      const runSpec = !sess.specDone;
      return streamTurn(res, sess, body?.text || "", images, {
        saveStudent: true,
        runEval: !isFirst || sess.transcript.length > 0,
        runSpec,
      });
    }

    if (method === "POST" && path === "/api/similar") {
      const body = await readJson(req);
      const sess = sessions.get(body?.sessionId);
      if (!sess) return json(res, 404, { error: "会话不存在" });
      return streamTurn(res, sess, "学生确认已理解，请出一道同型巩固题，仍然不要直接给解答。", undefined, {
        saveStudent: false,
        runEval: false,
        runSpec: false,
      });
    }

    if (method === "POST" && path === "/api/archive") return handleArchive(res, await readJson(req));

    if (method === "GET" && path === "/api/mistakes") {
      const f = {
        type: url.searchParams.get("type") || undefined,
        dueOnly: url.searchParams.get("due") === "1",
        unmasteredOnly: url.searchParams.get("unmastered") === "1",
      };
      return json(res, 200, { stats: getStats(db), list: getMistakes(db, f) });
    }

    if (method === "GET" && path === "/api/review/due") return json(res, 200, { list: getDueMistakes(db) });
    if (method === "POST" && path === "/api/review/start") return handleReviewStart(res, await readJson(req));
    if (method === "POST" && path === "/api/review/grade") return handleReviewGrade(res, await readJson(req));

    if (method === "GET" && path === "/api/sessions") return json(res, 200, { list: listSessions(db) });
    if (method === "GET" && path.startsWith("/api/session/")) {
      const id = decodeURIComponent(path.slice("/api/session/".length));
      return json(res, 200, { turns: getTurns(db, id) });
    }

    json(res, 404, { error: "未知接口" });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, () => console.log(`学习助理服务运行在 http://localhost:${PORT}`));
