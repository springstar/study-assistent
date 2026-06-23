import { useMemo, useRef, useState, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { toLatex } from "../mathInput.ts";

// 工具栏模板：label 显示，insert 插入文本（▢ 为占位光标点）
const TOOLS: { label: string; insert: string }[] = [
  { label: "x²", insert: "^2" },
  { label: "xⁿ", insert: "^(▢)" },
  { label: "x₀", insert: "_(▢)" },
  { label: "√", insert: "sqrt(▢)" },
  { label: "a/b", insert: "(▢)/(▢)" },
  { label: "π", insert: "pi" },
  { label: "≤", insert: "<=" },
  { label: "≥", insert: ">=" },
  { label: "≠", insert: "!=" },
  { label: "±", insert: "±" },
  { label: "×", insert: "*" },
  { label: "∞", insert: "oo" },
  { label: "→", insert: "→" },
];

// 补全词典：\命令 + 函数名
const COMPLETIONS = [
  "\\sqrt", "\\frac", "\\pi", "\\sum", "\\int", "\\lim", "\\le", "\\ge", "\\ne",
  "\\times", "\\div", "\\cdot", "\\infty", "\\alpha", "\\beta", "\\theta", "\\Delta",
  "\\rightarrow", "\\in", "\\mathbb{R}",
];
const FUNCS = ["sin", "cos", "tan", "log", "ln", "lim"];

export function Composer({
  value,
  onChange,
  onSend,
  busy,
  placeholder,
  attachment,
  actions,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder?: string;
  attachment?: ReactNode;
  actions?: ReactNode;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [comp, setComp] = useState<{ items: string[]; sel: number; tokenStart: number } | null>(null);

  // 实时预览：含数学迹象才渲染
  const previewHtml = useMemo(() => {
    if (!value.trim() || /^[\s一-龥，。、？！：；""'']+$/.test(value)) return "";
    try {
      return katex.renderToString(toLatex(value), { throwOnError: false, displayMode: false });
    } catch {
      return "";
    }
  }, [value]);

  /** 在光标处插入文本；▢ 作为插入后光标落点（选中第一个 ▢ 或定位末尾） */
  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const clean = text.replace(/▢/g, "");
    const next = value.slice(0, s) + clean + value.slice(e);
    onChange(next);
    const caret = text.indexOf("▢");
    const pos = caret >= 0 ? s + caret : s + clean.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  /** 根据光标前的当前 token 更新补全候选 */
  function updateCompletion() {
    const ta = taRef.current;
    if (!ta) return setComp(null);
    const pos = ta.selectionStart;
    const before = value.slice(0, pos);
    const m = /(\\[a-zA-Z]*|[a-zA-Z]+)$/.exec(before);
    if (!m) return setComp(null);
    const token = m[0];
    if (token.length < 2) return setComp(null);
    let items: string[] = [];
    if (token.startsWith("\\")) items = COMPLETIONS.filter((c) => c.startsWith(token));
    else items = FUNCS.filter((f) => f.startsWith(token) && f !== token).map((f) => `\\${f}`);
    if (items.length === 0) return setComp(null);
    setComp({ items, sel: 0, tokenStart: pos - token.length });
  }

  function applyCompletion(item: string) {
    const ta = taRef.current;
    if (!ta || !comp) return;
    const pos = ta.selectionStart;
    const insert = FUNCS.includes(item.slice(1)) ? `${item}(▢)` : item;
    const clean = insert.replace(/▢/g, "");
    const next = value.slice(0, comp.tokenStart) + clean + value.slice(pos);
    onChange(next);
    const caret = insert.indexOf("▢");
    const newPos = caret >= 0 ? comp.tokenStart + caret : comp.tokenStart + clean.length;
    setComp(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (comp) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setComp({ ...comp, sel: (comp.sel + 1) % comp.items.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setComp({ ...comp, sel: (comp.sel - 1 + comp.items.length) % comp.items.length });
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        applyCompletion(comp.items[comp.sel]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setComp(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="composer">
      {attachment}
      <div className="toolbar">
        {TOOLS.map((t) => (
          <button key={t.label} type="button" disabled={busy} onClick={() => insertAtCursor(t.insert)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="ta-wrap">
        <textarea
          ref={taRef}
          value={value}
          placeholder={placeholder ?? "打字描述思路即可；公式多直接拍照 📷，或用 ^ _ / sqrt 等写法（下方实时预览）"}
          disabled={busy}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(updateCompletion);
          }}
          onKeyUp={updateCompletion}
          onClick={updateCompletion}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setComp(null), 150)}
        />
        {comp && (
          <ul className="completion">
            {comp.items.map((it, i) => (
              <li
                key={it}
                className={i === comp.sel ? "on" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyCompletion(it);
                }}
              >
                {it}
              </li>
            ))}
          </ul>
        )}
      </div>
      {previewHtml && (
        <div className="preview">
          <span className="preview-tag">预览</span>
          <span dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
      <div className="actions">{actions}</div>
    </div>
  );
}
