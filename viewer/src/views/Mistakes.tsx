import { useEffect, useState } from "react";
import * as api from "../api.ts";

type Filter = { type?: string; due?: boolean; unmastered?: boolean };

export function Mistakes() {
  const [data, setData] = useState<{ stats: any; list: any[] } | null>(null);
  const [filter, setFilter] = useState<Filter>({});

  useEffect(() => {
    api.fetchMistakes(filter).then(setData);
  }, [filter]);

  if (!data) return <div className="placeholder">加载中…</div>;
  const { stats, list } = data;

  return (
    <div className="page">
      <h2>错题库</h2>
      <div className="stats">
        <div className="stat">总计 <b>{stats.total}</b></div>
        <div className="stat">已掌握 <b>{stats.mastered}</b></div>
        <div className="stat">待复习 <b>{stats.dueNow}</b></div>
      </div>
      <div className="chips">
        {stats.byType.map((t: any) => (
          <span
            key={t.problem_type}
            className={`chip ${filter.type === t.problem_type ? "on" : ""}`}
            onClick={() => setFilter((f) => ({ ...f, type: f.type === t.problem_type ? undefined : t.problem_type }))}
          >
            {t.problem_type} {t.count}（未掌握{t.unmastered}）
          </span>
        ))}
      </div>
      <div className="filters">
        <button className={filter.due ? "on" : ""} onClick={() => setFilter((f) => ({ ...f, due: !f.due }))}>
          只看到期
        </button>
        <button
          className={filter.unmastered ? "on" : ""}
          onClick={() => setFilter((f) => ({ ...f, unmastered: !f.unmastered }))}
        >
          只看未掌握
        </button>
      </div>
      <div className="mlist">
        {list.length === 0 && <div className="empty">（无）</div>}
        {list.map((m: any) => (
          <div key={m.id} className="mrow">
            <div className="mtop">
              <span className="tag">{m.problem_type}</span>
              {m.mastered ? <span className="mastered">★掌握</span> : null}
              <span className="due">到期 {m.review_due_at?.slice(0, 10) ?? "—"} · reps{m.reps}</span>
            </div>
            <div className="mblock">卡点：{m.block_point}</div>
            <div className="msum">{m.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
