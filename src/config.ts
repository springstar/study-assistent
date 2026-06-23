import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { getModel } from "@earendil-works/pi-ai";

const __dir = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dir, "..");

// 认证：优先用进程已有 env，否则从 scratch-world/.env 加载（含 ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL 中转）
const ENV_FILE = "/Users/wuchunxin/agents/scratch-world/.env";
if (!process.env.ANTHROPIC_API_KEY && existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

export const TUTOR_MODEL = "claude-sonnet-4-5-20250929";
export const EVAL_MODEL = "claude-haiku-4-5-20251001"; // 每轮调=高频，用便宜模型
export const DB_PATH = join(ROOT, "data.db");
export const SKILL_PATH = join(ROOT, "skills", "math-tutor", "SKILL.md");

export const getApiKey = (_provider: string) => process.env.ANTHROPIC_API_KEY;

/** getModel + 套用 ANTHROPIC_BASE_URL 中转（pi-ai 读 model.baseUrl，不自动读 env） */
export function model(id: string) {
  const m = getModel("anthropic", id as any);
  if (process.env.ANTHROPIC_BASE_URL) m.baseUrl = process.env.ANTHROPIC_BASE_URL;
  return m;
}

