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

export default function App() {
  const [view, setView] = useState<string>("chat");
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
        {/* 聊天/复习含活跃会话，始终挂载、用 display 切换，避免切 tab 丢失对话 */}
        <div style={{ display: view === "chat" ? "block" : "none", height: "100%" }}>
          <Chat />
        </div>
        <div style={{ display: view === "review" ? "block" : "none", height: "100%" }}>
          <Review />
        </div>
        {/* 纯展示页，进入时重新拉取最新数据 */}
        {view === "mistakes" && <Mistakes />}
        {view === "history" && <History />}
      </main>
    </div>
  );
}
