import { useEffect, useRef, useState } from "react";
import { Viz } from "../Viz.tsx";
import { MessageBubble } from "../components/MessageBubble.tsx";
import { ErrorBoundary } from "../components/ErrorBoundary.tsx";
import { Composer } from "../components/Composer.tsx";
import { maybeWrapMath } from "../mathInput.ts";
import type { Spec } from "../spec.ts";
import * as api from "../api.ts";

type Msg = { role: "student" | "assistant" | "system"; text: string };

export function Chat() {
  const [subjects, setSubjects] = useState<string[]>(["数学", "物理", "化学"]);
  const [status, setStatus] = useState<{ tutor: string; evaluator: string } | null>(null);
  const [subject, setSubject] = useState("数学");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [verdict, setVerdict] = useState<api.Verdict | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [image, setImage] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getSubjects().then((d) => d.subjects?.length && setSubjects(d.subjects)).catch(() => {});
    api.getStatus().then(setStatus).catch(() => {});
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function ensureSession() {
    if (sessionId) return sessionId;
    const d = await api.createSession(subject);
    setSessionId(d.sessionId);
    return d.sessionId;
  }

  const appendDelta = (t: string) =>
    setMsgs((m) => {
      const c = [...m];
      c[c.length - 1] = { role: "assistant", text: c[c.length - 1].text + t };
      return c;
    });

  function pickImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result); // data:<mime>;base64,xxxx
      const m = /^data:(.*?);base64,(.*)$/.exec(url);
      if (m) setImage({ mime: m[1], base64: m[2], name: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function send(text: string) {
    if ((!text.trim() && !image) || busy) return;
    setBusy(true);
    const img = image;
    try {
      const sid = await ensureSession();
      const wrapped = maybeWrapMath(text); // 含数学迹象的转成 $...$ LaTeX 发给老师
      const shown = text || (img ? `[图片] ${img.name}` : "");
      setMsgs((m) => [...m, { role: "student", text: wrapped || shown }, { role: "assistant", text: "" }]);
      setInput("");
      setImage(null);
      await api.streamMessage(
        "/api/message",
        { sessionId: sid, text: wrapped, imageBase64: img?.base64, imageMime: img?.mime },
        {
          onDelta: appendDelta,
          onVerdict: setVerdict,
          onSpec: (s) => setSpec(s),
          onError: (msg) => setMsgs((m) => [...m, { role: "system", text: "⚠ " + msg }]),
        },
      );
      setStarted(true);
    } finally {
      setBusy(false);
    }
  }

  async function similar() {
    if (busy || !sessionId) return;
    setBusy(true);
    try {
      setMsgs((m) => [...m, { role: "assistant", text: "" }]);
      await api.streamMessage("/api/similar", { sessionId }, { onDelta: appendDelta });
    } finally {
      setBusy(false);
    }
  }

  async function doArchive() {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const r = await api.archive(sessionId);
      setMsgs((m) => [...m, { role: "system", text: `✓ 已记入错题库 · 类型 ${r.problemType} · 卡点 ${r.blockPoint}` }]);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSessionId(null);
    setMsgs([]);
    setVerdict(null);
    setSpec(null);
    setStarted(false);
  }

  return (
    <div className="chat">
      <div className="chat-main">
        <header className="chat-head">
          <select
            value={subject}
            disabled={started || busy}
            onChange={(e) => {
              setSubject(e.target.value);
              reset();
            }}
          >
            {subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="hint">
            {started ? "辅导中" : "选科目，发第一道题开始"}
            {status && <span className="model-tag">引导 {status.tutor} · 评估 {status.evaluator}</span>}
          </span>
          <button onClick={reset} disabled={busy}>
            新会话
          </button>
        </header>

        <div className="messages">
          {msgs.length === 0 && <div className="empty">发一道{subject}题，老师会引导你一步步想（不直接给答案）。</div>}
          {msgs.map((m, i) => (
            <MessageBubble key={i} role={m.role} text={m.text} />
          ))}
          {verdict && (
            <div className="verdict">
              理解 {verdict.understood ? "✓" : "✗"} · 置信 {verdict.confidence.toFixed(2)}
              {verdict.gaps.length ? ` · 缺口：${verdict.gaps.join("、")}` : ""}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          busy={busy}
          onPasteImage={pickImage}
          attachment={
            image && (
              <div className="attach">
                📎 {image.name} <button onClick={() => setImage(null)}>移除</button>
              </div>
            )
          }
          actions={
            <>
              <button onClick={() => send(input)} disabled={busy || (!input.trim() && !image)}>
                发送
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={busy}>
                📷 拍照题目
              </button>
              <button onClick={similar} disabled={busy || !started}>
                巩固题
              </button>
              <button onClick={doArchive} disabled={busy || !started}>
                归档错题
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])}
              />
            </>
          }
        />
      </div>

      {spec && (
        <aside className="viz-panel">
          <div className="viz-head">
            可视化
            <button onClick={() => setSpec(null)}>×</button>
          </div>
          <div className="viz-body">
            <ErrorBoundary key={JSON.stringify(spec)} fallback={<div className="viz-fail">这道题暂不适合可视化</div>}>
              <Viz spec={spec} />
            </ErrorBoundary>
          </div>
        </aside>
      )}
    </div>
  );
}
