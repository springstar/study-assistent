import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "../components/MessageBubble.tsx";
import { Composer } from "../components/Composer.tsx";
import { maybeWrapMath } from "../mathInput.ts";
import * as api from "../api.ts";

type Msg = { role: "student" | "assistant" | "system"; text: string };

export function Review() {
  const [due, setDue] = useState<any[] | null>(null);
  const [active, setActive] = useState<{ sessionId: string; mistakeId: string; summary: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) api.reviewDue().then((d) => setDue(d.list));
  }, [active]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const appendDelta = (t: string) =>
    setMsgs((m) => {
      const c = [...m];
      c[c.length - 1] = { role: "assistant", text: c[c.length - 1].text + t };
      return c;
    });

  async function start(mid: string) {
    setBusy(true);
    try {
      const d = await api.reviewStart(mid);
      setActive({ sessionId: d.sessionId, mistakeId: mid, summary: d.summary });
      setMsgs([
        { role: "system", text: `复习：${d.summary}（上次卡点：${d.blockPoint}）` },
        { role: "assistant", text: "" },
      ]);
      setResult(null);
      await api.streamMessage("/api/message", { sessionId: d.sessionId, text: d.seedText }, { onDelta: appendDelta });
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    if (!text.trim() || busy || !active) return;
    setBusy(true);
    try {
      const wrapped = maybeWrapMath(text);
      setMsgs((m) => [...m, { role: "student", text: wrapped }, { role: "assistant", text: "" }]);
      setInput("");
      await api.streamMessage("/api/message", { sessionId: active.sessionId, text: wrapped }, { onDelta: appendDelta });
    } finally {
      setBusy(false);
    }
  }

  async function grade() {
    if (!active || busy) return;
    setBusy(true);
    try {
      setResult(await api.reviewGrade(active.sessionId, active.mistakeId));
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    setActive(null);
    setMsgs([]);
    setResult(null);
  }

  if (!active) {
    return (
      <div className="page">
        <h2>复习（间隔重排）</h2>
        {due === null && <div className="placeholder">加载中…</div>}
        {due && due.length === 0 && <div className="empty">暂无到期错题。去聊天里多练，错题会自动安排复习。</div>}
        {due?.map((m: any) => (
          <div key={m.id} className="mrow">
            <div className="mtop">
              <span className="tag">{m.problem_type}</span>
              <span className="due">到期 {m.review_due_at?.slice(0, 10)}</span>
            </div>
            <div className="mblock">卡点：{m.block_point}</div>
            <div className="msum">{m.summary}</div>
            <button className="start-btn" onClick={() => start(m.id)}>
              开始复习
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-main">
        <header className="chat-head">
          <span className="hint">复习中：{active.summary}</span>
          <button onClick={finish}>退出</button>
        </header>
        <div className="messages">
          {msgs.map((m, i) => (
            <MessageBubble key={i} role={m.role} text={m.text} />
          ))}
          {result && (
            <div className="bubble system">
              质量 {result.quality}/5 · 下次复习 {result.dueAt.slice(0, 10)}（{result.interval}天后）
              {result.mastered ? " · ★已掌握" : ""}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          busy={busy}
          placeholder="重新解这道题…（公式可用 ^ _ / sqrt 写法，下方实时预览）"
          actions={
            <>
              <button onClick={() => send(input)} disabled={busy || !input.trim()}>
                发送
              </button>
              <button onClick={grade} disabled={busy || !!result}>
                完成评分
              </button>
              {result && <button onClick={finish}>下一题</button>}
            </>
          }
        />
      </div>
    </div>
  );
}
