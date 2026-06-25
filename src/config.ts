import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { getModel, type Model, type Api } from "@earendil-works/pi-ai";

const __dir = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dir, "..");

// 认证：从项目自带 .env 加载（不依赖外部项目）
const ENV_FILE = join(ROOT, ".env");
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// 模型 id 由 env 控制，便于切换。Tutor 默认 GLM（经 OpenAI 兼容中转），Evaluator 默认 Haiku。
export const TUTOR_MODEL = process.env.TUTOR_MODEL || "glm-5.2";
export const EVAL_MODEL = process.env.EVAL_MODEL || "claude-haiku-4-5-20251001";
export const DB_PATH = join(ROOT, "data.db");

export const getApiKey = (provider: string) =>
  provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;

/** 手构一个 Model 对象（用于 pi-ai MODELS 表里没有的自定义模型，如经 OpenAI 兼容中转的 GLM）。 */
function buildOpenAICompatModel(id: string, baseUrl: string): Model<Api> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: "openai",
    baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
  } as Model<Api>;
}

/** 按 model id 取 Model：非 Anthropic 模型(glm/deepseek 等)走 OpenAI 兼容中转，其余走 Anthropic。 */
export function model(id: string): Model<Api> {
  if (id.startsWith("claude")) {
    const m = getModel("anthropic", id as any);
    if (process.env.ANTHROPIC_BASE_URL) m.baseUrl = process.env.ANTHROPIC_BASE_URL;
    return m as Model<Api>;
  }
  // glm/deepseek/其它 → OpenAI 兼容端点（baseUrl 带 /v1，provider 拼 /chat/completions）
  const base = process.env.OPENAI_BASE_URL || "https://api.ofox.io/v1";
  return buildOpenAICompatModel(id, base.replace(/\/+$/, ""));
}
