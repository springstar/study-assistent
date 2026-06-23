import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync } from "node:fs";
import { openDb, getDueMistakes, updateSchedule } from "./db.ts";
import { createTutor, ask, loadImage } from "./tutor.ts";
import { evaluate, type Turn, type Verdict } from "./evaluator.ts";
import { sm2, MASTERED_INTERVAL } from "./sm2.ts";

const UNDERSTOOD_CONFIDENCE = 0.7;

/** Evaluator 判定 → SM-2 质量分（0..5）。由裁判判定，不让学生自评，防作弊 */
function toQuality(v: Verdict | null): number {
  if (!v) return 2; // 没产生有效判定（直接结束）
  if (!v.understood) return v.confidence >= 0.4 ? 2 : 1;
  if (v.confidence >= 0.85) return 5;
  if (v.confidence >= UNDERSTOOD_CONFIDENCE) return 4;
  return 3;
}

type Outcome = "graded" | "skip" | "quit";

async function reviewOne(rl: readline.Interface, db: any, m: any): Promise<Outcome> {
  console.log(`\n=== 复习 [${m.id.slice(0, 8)}] ${m.subject} · ${m.problem_type} ===`);
  console.log(`摘要：${m.summary}`);
  console.log(`上次卡点：${m.block_point}`);
  console.log("(/skip 跳过本题  /done 结束并评分  /quit 退出复习)");

  const tutor = createTutor();
  const transcript: Turn[] = [];
  let pendingGaps: string[] = [];
  let lastVerdict: Verdict | null = null;

  const images = m.problem_image_path && existsSync(m.problem_image_path) ? [loadImage(m.problem_image_path)] : undefined;
  const seed = m.problem_text
    ? `这是我之前做错的题，请你引导我重新做一遍（按你平时的方式，先问我思路，别直接给答案）：\n${m.problem_text}`
    : "这是我之前做错的题（见图），请你引导我重新做一遍，先问我思路，别直接给答案。";

  process.stdout.write("\n老师：");
  const first = await ask(tutor, seed, images);
  transcript.push({ role: "assistant", content: first });

  while (true) {
    const input = (await rl.question("\n你：")).trim();
    if (!input) continue;
    if (input === "/quit") return "quit";
    if (input === "/skip") return "skip";
    if (input === "/done") break;

    transcript.push({ role: "student", content: input });
    const promptText = pendingGaps.length
      ? `${input}\n\n[系统给老师的私下提示，勿告诉学生：学生仍有缺口——${pendingGaps.join("；")}。围绕最关键一点引导，不要点破。]`
      : input;

    process.stdout.write("\n老师：");
    const reply = await ask(tutor, promptText);
    transcript.push({ role: "assistant", content: reply });

    lastVerdict = await evaluate(transcript);
    pendingGaps = lastVerdict.understood ? [] : lastVerdict.gaps;
    console.log(
      `\n  [评估] 理解=${lastVerdict.understood} 置信=${lastVerdict.confidence.toFixed(2)} 缺口=${lastVerdict.gaps.join("、") || "无"}`,
    );
    if (lastVerdict.understood && lastVerdict.confidence >= UNDERSTOOD_CONFIDENCE) {
      console.log("  ✓ 这次掌握得不错，本题复习完成。");
      break;
    }
  }

  // 评分 → SM-2 重排
  const q = toQuality(lastVerdict);
  const sched = sm2({ ef: m.ef, reps: m.reps, interval: m.interval_days }, q);
  const due = new Date(Date.now() + sched.interval * 24 * 3600 * 1000);
  const mastered = sched.interval >= MASTERED_INTERVAL;
  updateSchedule(db, m.id, sched, due, mastered);
  console.log(
    `  质量=${q}  下次复习：${due.toISOString().slice(0, 10)}（${sched.interval}天后）${mastered ? "  ★已掌握" : ""}`,
  );
  return "graded";
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("缺 ANTHROPIC_API_KEY，无法调用模型。");
    process.exit(1);
  }
  const db = openDb();
  const due = getDueMistakes(db);
  if (due.length === 0) {
    console.log("没有到期需要复习的错题。");
    db.close();
    return;
  }
  console.log(`有 ${due.length} 道到期错题待复习。`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  let done = 0;
  for (const m of due) {
    const outcome = await reviewOne(rl, db, m);
    if (outcome === "quit") break;
    if (outcome === "graded") done++;
  }
  rl.close();
  db.close();
  console.log(`\n本次复习 ${done} 道。再见。`);
}

main().catch((e) => {
  console.error("\n出错：", e);
  process.exit(1);
});
