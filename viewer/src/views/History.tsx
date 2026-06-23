import { useEffect, useState } from "react";
import { MessageBubble } from "../components/MessageBubble.tsx";
import * as api from "../api.ts";

export function History() {
  const [list, setList] = useState<any[] | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const [turns, setTurns] = useState<any[] | null>(null);

  useEffect(() => {
    api.listSessions().then((d) => setList(d.list));
  }, []);

  async function open(s: any) {
    setSel(s);
    setTurns(null);
    const d = await api.getSessionTurns(s.id);
    setTurns(d.turns);
  }

  if (sel) {
    return (
      <div className="chat">
        <div className="chat-main">
          <header className="chat-head">
            <span className="hint">
              {sel.subject} · {sel.created_at?.slice(0, 16).replace("T", " ")}
            </span>
            <button
              onClick={() => {
                setSel(null);
                setTurns(null);
              }}
            >
              返回
            </button>
          </header>
          <div className="messages">
            {turns === null && <div className="placeholder">加载中…</div>}
            {turns?.length === 0 && <div className="empty">（无对话记录）</div>}
            {turns?.map((t: any, i: number) => (
              <MessageBubble key={i} role={t.role === "assistant" ? "assistant" : "student"} text={t.content} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>历史会话</h2>
      {list === null && <div className="placeholder">加载中…</div>}
      {list && list.length === 0 && <div className="empty">还没有会话。</div>}
      {list?.map((s: any) => (
        <div key={s.id} className="mrow clickable" onClick={() => open(s)}>
          <div className="mtop">
            <span className="tag">{s.subject}</span>
            <span className="due">
              {s.created_at?.slice(0, 16).replace("T", " ")} · {s.turn_count}回合 · {s.mistake_count}错题
            </span>
          </div>
          <div className="msum">{s.problem_text || (s.problem_image_path ? "[图片题目]" : "（无题干）")}</div>
        </div>
      ))}
    </div>
  );
}
