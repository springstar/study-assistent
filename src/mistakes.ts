import { openDb, getMistakes, getStats, type MistakeFilter } from "./db.ts";

const HELP = `错题库管理

用法: npm run mistakes [-- 选项]
  --type <题型>     只看某题型（导数/解析几何/数列/立体几何/概率统计/新定义/开放题）
  --due             只看到期待复习的
  --unmastered      只看未掌握的
  --help            显示此帮助

不带选项 = 统计概览 + 全部错题列表`;

function pad(s: string, n: number): string {
  // 中文按 2 宽度计
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1;
  return s + " ".repeat(Math.max(0, n - w));
}

function parseArgs(argv: string[]): MistakeFilter & { help: boolean } {
  const f: MistakeFilter & { help: boolean } = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help") f.help = true;
    else if (a === "--due") f.dueOnly = true;
    else if (a === "--unmastered") f.unmasteredOnly = true;
    else if (a === "--type") f.type = argv[++i];
  }
  return f;
}

function main() {
  const f = parseArgs(process.argv.slice(2));
  if (f.help) {
    console.log(HELP);
    return;
  }
  const db = openDb();
  const s = getStats(db);

  console.log("=== 错题库统计 ===");
  console.log(`总计 ${s.total}　已掌握 ${s.mastered}　待复习(到期) ${s.dueNow}`);
  if (s.byType.length) {
    console.log("按题型: " + s.byType.map((t) => `${t.problem_type}${t.count}(未掌握${t.unmastered})`).join("　"));
  }
  if (s.byAbility.length) {
    console.log("按能力: " + s.byAbility.map((a) => `${a.core_ability}${a.count}`).join("　"));
  }
  const weak = s.byType.filter((t) => t.unmastered > 0).slice(0, 3);
  if (weak.length) {
    console.log("最弱题型: " + weak.map((t) => `${t.problem_type}(${t.unmastered})`).join("、"));
  }

  const rows = getMistakes(db, f);
  const filterDesc = [f.type && `题型=${f.type}`, f.dueOnly && "到期", f.unmasteredOnly && "未掌握"]
    .filter(Boolean)
    .join(" ");
  console.log(`\n=== 错题列表${filterDesc ? `（${filterDesc}）` : ""} 共 ${rows.length} 条 ===`);
  if (rows.length === 0) {
    console.log("（无）");
  } else {
    for (const m of rows) {
      const due = m.review_due_at ? m.review_due_at.slice(0, 10) : "—";
      const mark = m.mastered ? "★掌握" : "";
      console.log(
        `[${m.id.slice(0, 8)}] ${pad(m.problem_type || "?", 12)} 卡点:${pad(m.block_point || "—", 30)} reps${m.reps} 间隔${m.interval_days}d 到期${due} ${mark}`,
      );
    }
  }
  db.close();
}

main();
