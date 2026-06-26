import { useState } from "react";
import { Chat } from "./views/Chat.tsx";
import { Mistakes } from "./views/Mistakes.tsx";
import { Review } from "./views/Review.tsx";
import { History } from "./views/History.tsx";
import "./App.css";

const VIEWS = [
  ["chat", "聊天"],
  ["mistakes", "错题库"],
  ["review", "复习"],
  ["history", "历史"],
] as const;

export type LoadRequest = {
  sessionId: string;
  subject: string;
  turns: { role: "student" | "assistant"; content: string }[];
};

export default function App() {
  const [view, setView] = useState<string>("chat");
  const [loadReq, setLoadReq] = useState<LoadRequest | null>(null);
  const [, forceTick] = useState(0);

  const continueSession = (req: LoadRequest) => {
    setLoadReq(req);
    setView("chat");
    forceTick((n) => n + 1);
  };

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">高考学习助理</div>
        {VIEWS.map(([k, label]) => (
          <button key={k} className={view === k ? "active" : ""} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </nav>
      <main className="view">
        <div style={{ display: view === "chat" ? "block" : "none", height: "100%" }}>
          <Chat loadReq={loadReq} onConsumed={() => setLoadReq(null)} />
        </div>
        <div style={{ display: view === "review" ? "block" : "none", height: "100%" }}>
          <Review />
        </div>
        {view === "mistakes" && <Mistakes />}
        {view === "history" && <History onContinue={continueSession} />}
      </main>
    </div>
  );
}
