import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, createSession, saveTurn, saveMistake, getSimilar, getDueMistakes, updateSchedule, getMistakes, getStats } from "./db.ts";
import { parseVerdict } from "./evaluator.ts";
import { sm2, FRESH } from "./sm2.ts";
import { retry } from "./llm.ts";

test("db: session/turn/mistake 往返 + getSimilar 按题型过滤", () => {
  const db = openDb(":memory:");
  const sid = createSession(db, "数学", "108塔题");
  saveTurn(db, sid, "student", "不会");
  saveTurn(db, sid, "assistant", "先看规律");

  saveMistake(db, {
    sessionId: sid, coreAbility: "建模", problemType: "数列",
    blockPoint: "提不出等差结构", summary: "108塔", keySteps: "分组求和", solution: "首项+公差",
  });
  saveMistake(db, {
    sessionId: sid, coreAbility: "运算", problemType: "导数",
    blockPoint: "不会分类讨论", summary: "含参导数", keySteps: "讨论参数", solution: "分段",
  });

  const turns = db.prepare("SELECT * FROM turns WHERE session_id = ?").all(sid);
  assert.equal(turns.length, 2);

  const shulie = getSimilar(db, "数列");
  assert.equal(shulie.length, 1);
  assert.equal((shulie[0] as any).block_point, "提不出等差结构");

  const due = db.prepare("SELECT review_due_at FROM mistakes LIMIT 1").get() as any;
  assert.ok(due.review_due_at, "应有间隔复习时间");
  db.close();
});

test("evaluator: 合法 JSON 解析", () => {
  const v = parseVerdict('前言 {"understood":true,"confidence":0.8,"gaps":[],"reason":"能复述"} 后语');
  assert.ok(v);
  assert.equal(v!.understood, true);
  assert.equal(v!.confidence, 0.8);
});

test("evaluator: 非法/缺键 JSON 返回 null（触发回退）", () => {
  assert.equal(parseVerdict("根本不是 JSON"), null);
  assert.equal(parseVerdict('{"understood":true}'), null); // 缺键
  assert.equal(parseVerdict('{"understood":"yes","confidence":1,"gaps":[],"reason":"x"}'), null); // 类型错
});

test("sm2: 答对推进间隔 1→6→round(6*ef)，EF 上升", () => {
  const r1 = sm2(FRESH, 5);
  assert.equal(r1.reps, 1);
  assert.equal(r1.interval, 1);
  assert.ok(r1.ef > 2.5, "q=5 应抬高 EF");

  const r2 = sm2(r1, 5);
  assert.equal(r2.reps, 2);
  assert.equal(r2.interval, 6);

  const r3 = sm2(r2, 4);
  assert.equal(r3.reps, 3);
  assert.equal(r3.interval, Math.round(6 * r2.ef));
});

test("sm2: 没掌握(q<3)重置 reps、间隔回到 1、EF 下降且不低于 1.3", () => {
  const good = sm2(sm2(FRESH, 5), 5); // reps=2, interval=6
  const fail = sm2(good, 1);
  assert.equal(fail.reps, 0);
  assert.equal(fail.interval, 1);
  assert.ok(fail.ef < good.ef);

  let s = { ef: 1.3, reps: 0, interval: 0 };
  for (let i = 0; i < 5; i++) s = sm2(s, 0);
  assert.ok(s.ef >= 1.3, "EF 不低于 1.3");
});

test("db: getDueMistakes 只取到期未掌握，updateSchedule 改期", () => {
  const db = openDb(":memory:");
  const sid = createSession(db, "数学", "导数题");
  saveMistake(db, {
    sessionId: sid, coreAbility: "运算", problemType: "导数",
    blockPoint: "分类讨论", summary: "含参导数", keySteps: "讨论", solution: "分段",
  });
  const id = (db.prepare("SELECT id FROM mistakes").get() as any).id;

  // 默认到期为明天 → 现在查不到
  assert.equal(getDueMistakes(db, new Date()).length, 0);
  // 两天后查 → 到期
  const due = getDueMistakes(db, new Date(Date.now() + 2 * 86400000));
  assert.equal(due.length, 1);
  assert.equal(due[0].problem_text, "导数题", "应 JOIN 出原题");

  updateSchedule(db, id, { ef: 2.6, reps: 1, interval: 1 }, new Date(Date.now() + 10 * 86400000), false);
  const row = db.prepare("SELECT ef, reps, interval_days FROM mistakes WHERE id = ?").get(id) as any;
  assert.equal(row.reps, 1);
  assert.equal(row.interval_days, 1);
  db.close();
});

test("db: getMistakes 过滤 + getStats 聚合", () => {
  const db = openDb(":memory:");
  const sid = createSession(db, "数学", "题");
  const mk = (type: string, ability: string) =>
    saveMistake(db, { sessionId: sid, coreAbility: ability, problemType: type, blockPoint: "x", summary: "s", keySteps: "k", solution: "v" });
  mk("导数", "运算");
  mk("导数", "运算");
  mk("数列", "建模");
  // 掌握其中一个导数
  const firstId = (db.prepare("SELECT id FROM mistakes WHERE problem_type='导数' LIMIT 1").get() as any).id;
  updateSchedule(db, firstId, { ef: 2.5, reps: 5, interval: 30 }, new Date(Date.now() + 30 * 86400000), true);

  assert.equal(getMistakes(db, { type: "导数" }).length, 2);
  assert.equal(getMistakes(db, { unmasteredOnly: true }).length, 2); // 1导数+1数列未掌握

  const s = getStats(db);
  assert.equal(s.total, 3);
  assert.equal(s.mastered, 1);
  const dao = s.byType.find((t) => t.problem_type === "导数")!;
  assert.equal(dao.count, 2);
  assert.equal(dao.unmastered, 1);
  db.close();
});

test("retry: 失败几次后成功", async () => {
  let n = 0;
  const r = await retry(
    async () => {
      n++;
      if (n < 3) throw new Error("瞬时");
      return "ok";
    },
    (v) => v === "ok",
    { tries: 5, delayMs: 0 },
  );
  assert.equal(r, "ok");
  assert.equal(n, 3);
});

test("retry: 始终非 ok → 返回最后结果（降级，不抛）", async () => {
  let n = 0;
  const r = await retry(
    async () => `bad${++n}`,
    (v) => v === "good",
    { tries: 3, delayMs: 0 },
  );
  assert.equal(r, "bad3"); // 返回最后一次，让调用方降级解析
  assert.equal(n, 3);
});

test("retry: 每次都抛 → 抛最后的错误", async () => {
  await assert.rejects(
    retry(
      async () => {
        throw new Error("一直挂");
      },
      () => true,
      { tries: 2, delayMs: 0 },
    ),
    /一直挂/,
  );
});
