import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** 老师/学生消息用 markdown + KaTeX 渲染（$...$ 行内、$$...$$ 块级）；系统消息纯文本 */
export function MessageBubble({ role, text }: { role: "student" | "assistant" | "system"; text: string }) {
  if (role === "system") {
    return <div className="bubble system">{text || ""}</div>;
  }
  return (
    <div className={`bubble ${role} md`}>
      {text ? (
        <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
          {text}
        </ReactMarkdown>
      ) : (
        role === "assistant" ? "…" : ""
      )}
    </div>
  );
}
