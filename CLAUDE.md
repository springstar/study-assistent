# 高考学习助理 (study-assistent)

辅助高三学生冲刺高考的引导式学习助理。以聊天方式交互，用户上传题目（文本/图片），助理**不直接给答案**，而是用苏格拉底式提问引导学生自己想通；学生确实卡死才揭示解法，并确认理解后推同类题巩固、记入错题库。

## 核心产品逻辑

引导循环是产品灵魂，难点在对话流程不在技术栈。完整状态机见 `skills/math-tutor/SKILL.md`：

```
识别题型 → 引导出声思考 → 诊断卡点 → 分级提示+重试
  → [解决] → 确认理解(复述非"懂没") → 巩固+归档
  → [真放弃] → 揭示解法(分步,每步追问) → 确认理解 → 巩固
```

两个红线问题，实现时必须守住：
- **防套答案**：学生说"不会"不等于触发揭示。至少 2 轮提示无进展才算真放弃。
- **理解判定**：让学生**复述思路**来验证，不靠问"懂了吗"。

## 技术架构（已定决策）

| 维度 | 选型 | 备注 |
|------|------|------|
| Agent 框架 | pi-agent-core | |
| 前端 | React | 聊天为主，普通 2D UI |
| 3D | three.js / react-three-fiber | **仅几何/立体题可视化单独组件**，不全站用 |
| 存储 | SQLite | 单用户本地 |
| 输入 | 文本 + 图片 | 图片走 vision 模型直接读题（含公式/图形），**不做视频** |

### Agent 拓扑

```
Tutor Agent  ──(每轮学生回复)──> Evaluator Agent → 结构化判定
     │                            { understood, confidence, gaps }
     └── tools: log_turn() / save_mistake() / summarize() / get_similar()
```

- **Tutor**：跑苏格拉底引导（加载 math-tutor skill）。
- **Evaluator**：独立判理解度，与教学动机分离（避免 Tutor 乐观放水）。判 **逻辑完整性 + 能否应用**，不是关键词匹配。`gaps` 直接变下一个引导问题。
- **不设 Logger Agent**：记录是确定性操作，当工具/函数，不耗 LLM。

性能优化（先不做，慢了再加）：Evaluator 每轮调 = 双倍 LLM。可改为仅在 Tutor 判"可能懂了"时触发。

## 数据模型（SQLite）

```sql
sessions(id, problem_text, problem_image_path, subject, created_at)
turns(id, session_id, role, content, hint_level, created_at)
mistakes(id, session_id, core_ability, problem_type, block_point,
         summary, key_steps, solution, mastered, review_due_at)
```

- 图片存**路径**，不存 blob。
- `mistakes.block_point`（学生卡在哪个环节）是错题库灵魂——复习按**卡点**优先，不按知识点。
- `review_due_at`：间隔重复（SM-2 简版），否则错题库只是堆积。

## Skills 与多科目

- `skills/math-tutor/SKILL.md` — 数学引导，锚定 2026 新课标一卷真实题型（新定义压轴、多想少算、文化情境数列等）。
- `src/subjects.ts` 是科目注册表（单一事实源）：`{skillDir, problemTypes, viz}`。tutor 按科目加载 `skills/<skillDir>/SKILL.md`；`viz` 门控 genSpec；`problemTypes` 喂给错题提炼 prompt。
- **加新科目 = 注册表加一条 + 放 `skills/<skillDir>/SKILL.md`**（锚定该科真题）。未支持的科目输入会回退到 `DEFAULT_SUBJECT` 并提示。
- 当前只有数学；物理/英语等后续按上面方式扩，复用同一引导状态机。

## 实现顺序与进度

1. ✅ 纯文本跑通引导循环（核心、最难）
2. ✅ 加图片输入（vision 读题，`/img <路径>`）
3. ✅ 错题库 + 间隔复习（SM-2）
4. ✅ three.js 几何可视化（独立 viewer，立体几何 3D + 函数图）

### 代码现状（TS + Node 23，无构建，`node --experimental-strip-types --experimental-sqlite`）

```
src/config.ts     模型 id + ANTHROPIC_BASE_URL 中转 + 从 scratch-world/.env 读 key
src/db.ts         node:sqlite 建表/migrate + helpers（含 getDueMistakes/updateSchedule）
src/tutor.ts      createTutor（SKILL.md 作 systemPrompt）+ ask + loadImage
src/evaluator.ts  evaluate→{understood,confidence,gaps,reason}，独立裁判，JSON+重试+回退
src/sm2.ts        标准 SM-2 纯函数
src/vizspec.ts    genSpec(题目)→Spec|null：LLM 判断立体几何→solid/函数→function/其余→none
src/cli.ts        npm start —— 解新题，引导循环 + gaps 回注 + 错题归档
src/review.ts     npm run review —— 复习到期错题，verdict→quality→SM-2 重排
src/mistakes.ts   npm run mistakes —— 错题库统计概览 + 列表，过滤 --type/--due/--unmastered
src/db.test.ts    node:test 自检（db/evaluator/sm2）
viewer/           独立可视化子应用（Vite+React+R3F）。spec 驱动：立体几何 3D（OrbitControls 旋转 + Edges + Html 顶点标注）/ 函数图（采样曲线 + 切线）。npm run dev。
                  注：标注用 drei <Html> 不用 <Text>——<Text>(troika) 异步加载字体会让 headless/离线渲染整块 Suspense 挂起。
```

关键点：
- LLM 经 pi-ai，**baseUrl 要设在 model 对象上**（`config.model()`），pi-ai 不自动读 env。
- gaps 回注：Evaluator 每轮缺口作"给老师的私下提示"注入下一轮 Tutor（不入库、不示学生）。
- 错题字段提炼用**标签行格式**不用 JSON——数学/LaTeX 破坏 JSON 转义。
- 复习质量分由 **Evaluator 判定**映射，不让学生自评（防作弊）。
- 已知非阻塞点：CLI 用 readline，爆发式管道输入有竞态；真实人工逐行输入无碍。
- viewer ↔ Tutor 集成：CLI 首轮调 genSpec 把几何/函数题写到 `viewer/public/spec.json`（gitignore），viewer mount 时 fetch 加载为"📍 当前题目"。跨进程松耦合（CLI 与 viewer 各自独立运行）。`Spec` 类型在两个包各存一份（无共享构建）。

## 命题数据原则

skill 必须锚定**真实真题**，不要凭想象编"预测题型"。提炼题型时先查/核对真题（官方教育考试院评析 + 多源交叉），自媒体复原题干的数值细节存疑要标注。
