import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** 老师消息用 markdown + KaTeX 渲染（$...$ 行内、$$...$$ 块级）；学生/系统消息纯文本 */
export function MessageBubble({ role, text }: { role: "student" | "assistant" | "system"; text: string }) {
  if (role !== "assistant") {
    return <div className={`bubble ${role}`}>{text || ""}</div>;
  }
  return (
    <div className="bubble assistant md">
      {text ? (
        <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
          {text}
        </ReactMarkdown>
      ) : (
        "…"
      )}
    </div>
  );
}
