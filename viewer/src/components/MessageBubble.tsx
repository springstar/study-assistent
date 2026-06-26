import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** 老师/学生消息用 markdown + KaTeX 渲染（$...$ 行内、$$...$$ 块级）；学生消息可含图片；系统消息纯文本 */
export function MessageBubble({
  role,
  text,
  image,
}: {
  role: "student" | "assistant" | "system";
  text: string;
  image?: { base64: string; mime: string };
}) {
  if (role === "system") {
    return <div className="bubble system">{text || ""}</div>;
  }
  return (
    <div className={`bubble ${role} md`}>
      {image && (
        <img
          className="bubble-img"
          src={`data:${image.mime};base64,${image.base64}`}
          alt="题目图片"
        />
      )}
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
