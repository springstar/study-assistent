import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDb, createSession, saveTurn, saveMistake, getSimilar } from "./db.ts";
import { createTutor, ask, loadImage } from "./tutor.ts";
import { evaluate, type Turn } from "./evaluator.ts";
import { genSpec } from "./vizspec.ts";
import { completeWithRetry } from "./llm.ts";
import { EVAL_MODEL, model, ROOT } from "./config.ts";
import { SUBJECTS, DEFAULT_SUBJECT, resolveSubject, supportedSubjects } from "./subjects.ts";

const UNDERSTOOD_CONFIDENCE = 0.7;

async function readProblem(rl: readline.Interface): Promise<{ text: string; imagePath: string | null }> {
  console.log("粘贴题目（可多行）。拍照题目用 /img <图片路径> 附加。单独一行 /go 结束：");
  const lines: string[] = [];
  let imagePath: string | null = null;
  while (true) {
    const line = await rl.question("");
    const trimmed = line.trim();
    if (trimmed === "/go") {
      // 空输入校验：既无文字也无图片，不能开始
      if (lines.join("").trim() || imagePath) break;
      console.log("还没有题目内容。请粘贴题目文字，或用 /img <路径> 附图，再 /go。");
      continue;
    }
    if (trimmed.startsWith("/img ")) {
      imagePath = trimmed.slice(5).trim();
      continue;
    }
    lines.push(line);
  }
  return { text: lines.join("\n").trim(), imagePath };
}

/** 用一次独立 LLM 调用把对话提炼成错题字段。用标签行格式而非 JSON——数学/LaTeX 内容会破坏 JSON 转义 */
async function summarizeMistake(transcript: Turn[], subject: string) {
  const types = SUBJECTS[subject].problemTypes.join("/");
  const dialog = transcript.map((t) => `${t.role === "student" ? "学生" : "老师"}：${t.content}`).join("\n");
  const context = {
    systemPrompt:
      `把以下${subject}辅导对话提炼成错题档案。严格按下面 6 行格式输出，每项一行，冒号后写内容，不要 markdown、不要多余文字：\n` +
      `核心能力: (抽象/逻辑推理/建模/运算 之一)\n` +
      `题型: (${types} 之一)\n` +
      `卡点: (学生具体卡在哪个环节)\n` +
      `概述: (题目与关键难点，一句话)\n` +
      `关键步骤: (解题骨架，关键转折，一行写完)\n` +
      `解法: (最终解法要点，一行写完)`,
    messages: [{ role: "user" as const, content: dialog, timestamp: Date.now() }],
  };
  const res = await completeWithRetry(model(EVAL_MODEL), context);
  const text = (res.content as any[]).filter((c) => c.type === "text").map((c) => c.text).join("");
  const grab = (label: string): string => {
    const m = text.match(new RegExp(`^\\s*${label}\\s*[:：]\\s*(.+)$`, "m"));
    return m ? m[1].trim() : "";
  };
  return {
    coreAbility: grab("核心能力"),
    problemType: grab("题型"),
    blockPoint: grab("卡点"),
    summary: grab("概述"),
    keySteps: grab("关键步骤"),
    solution: grab("解法"),
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("缺 ANTHROPIC_API_KEY，无法调用模型。");
    process.exit(1);
  }
  const db = openDb();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const transcript: Turn[] = [];
  let pendingGaps: string[] = []; // 上一轮 Evaluator 判出的缺口，回注到下一轮 Tutor 引导

  const subjectInput = (await rl.question(`科目（默认 ${DEFAULT_SUBJECT}）：`)).trim() || DEFAULT_SUBJECT;
  const subject = resolveSubject(subjectInput) ?? DEFAULT_SUBJECT;
  if (subject !== subjectInput) {
    console.log(`暂只支持：${supportedSubjects().join("、")}。按 ${subject} 处理。`);
  }
  const tutor = createTutor(subject);
  const subjectCfg = SUBJECTS[subject];

  const { text: problem, imagePath } = await readProblem(rl);
  if (imagePath && !existsSync(imagePath)) {
    console.error(`图片不存在：${imagePath}`);
    process.exit(1);
  }
  const sessionId = createSession(db, subject, problem, imagePath);
  const problemForLog = problem || (imagePath ? `[图片题目 ${imagePath}]` : "");
  saveTurn(db, sessionId, "student", problemForLog);
  transcript.push({ role: "student", content: problemForLog });

  process.stdout.write("\n老师：");
  let images;
  try {
    images = imagePath ? [loadImage(imagePath)] : undefined;
  } catch (e) {
    console.error(`\n读图失败：${(e as Error).message}`);
    process.exit(1);
  }
  let firstReply: string;
  try {
    firstReply = await ask(tutor, problem || "请看图片里的题目。", images);
  } catch (e) {
    console.error(`\n开场失败：${(e as Error).message}\n请检查网络/服务后重试。`);
    db.close();
    process.exit(1);
  }
  saveTurn(db, sessionId, "assistant", firstReply);
  transcript.push({ role: "assistant", content: firstReply });
  console.log("\n\n（命令：/done 归档退出  /quit 直接退  /similar 出巩固题）\n");

  // 几何/函数题自动生成可视化 spec，写给 viewer（仅支持可视化的科目）
  if (subjectCfg.viz) {
    const spec = await genSpec(problem, images);
    if (spec) {
      const specPath = join(ROOT, "viewer", "public", "spec.json");
      writeFileSync(specPath, JSON.stringify(spec, null, 2));
      console.log(`📐 已生成可视化（${spec.kind === "solid" ? spec.solid : "函数图"}）。在 viewer 里刷新即可查看。\n`);
    }
  }

  async function archive() {
    console.log("\n正在归档错题…");
    const fields = await summarizeMistake(transcript, subject);
    const id = saveMistake(db, { sessionId, ...fields });
    console.log(`✓ 已记入错题库 [${id.slice(0, 8)}]  类型=${fields.problemType}  卡点=${fields.blockPoint}`);
    const similar = getSimilar(db, fields.problemType);
    if (similar.length > 1) console.log(`同型错题 ${similar.length} 条，可后续复习。`);
  }

  while (true) {
    const input = (await rl.question("\n你：")).trim();
    if (!input) continue;
    if (input === "/quit") break;
    if (input === "/done") {
      await archive();
      break;
    }
    if (input === "/similar") {
      process.stdout.write("\n老师：");
      try {
        const reply = await ask(tutor, "学生确认已理解，请出一道同型巩固题，仍然不要直接给解答。");
        saveTurn(db, sessionId, "assistant", reply);
        transcript.push({ role: "assistant", content: reply });
      } catch (e) {
        console.log(`\n⚠ 出题失败：${(e as Error).message}　请再试一次。`);
      }
      console.log();
      continue;
    }

    // 把上一轮评估的缺口作为给老师的私下提示注入（不入库、不展示给学生）
    const promptText = pendingGaps.length
      ? `${input}\n\n[系统给老师的私下提示，不要直接告诉学生：评估发现学生当前仍有这些理解缺口——${pendingGaps.join("；")}。请围绕其中最关键的一点设计你的下一个引导问题，逐步逼近，绝不直接点破。]`
      : input;

    process.stdout.write("\n老师：");
    let reply: string;
    try {
      reply = await ask(tutor, promptText);
    } catch (e) {
      // 网络/服务出错：不崩、不丢上下文，提示学生重发这一句
      console.log(`\n⚠ 出错：${(e as Error).message}　请重发刚才那句。`);
      continue;
    }
    // 成功后才落库，保持 transcript 与 DB 一致、便于重试
    saveTurn(db, sessionId, "student", input);
    transcript.push({ role: "student", content: input });
    saveTurn(db, sessionId, "assistant", reply);
    transcript.push({ role: "assistant", content: reply });

    const v = await evaluate(transcript);
    pendingGaps = v.understood ? [] : v.gaps; // 理解了就清空，否则带到下一轮
    console.log(
      `\n  [评估] 理解=${v.understood} 置信=${v.confidence.toFixed(2)} 缺口=${v.gaps.join("、") || "无"}`,
    );
    if (v.understood && v.confidence >= UNDERSTOOD_CONFIDENCE) {
      console.log("  ✓ 评估认为已理解。输入 /similar 巩固，或 /done 归档。");
    } else if (pendingGaps.length) {
      console.log("  → 已把缺口反馈给老师，下一轮针对性引导。");
    }
  }

  rl.close();
  db.close();
  console.log("\n再见。");
}

main().catch((e) => {
  console.error("\n出错：", e);
  process.exit(1);
});
