// 学生自然写法 → LaTeX 片段。用于输入框实时预览与发送前转换。
// ponytail: 正则级转换，覆盖常见写法；复杂表达式靠 KaTeX throwOnError:false 兜底。

/** 把一段「数学源码」转成 LaTeX。不含 $ 包裹。 */
export function toLatex(src: string): string {
  let s = src;

  // sqrt(...) → \sqrt{...}（先处理，避免后面括号规则干扰）
  s = replaceFunc(s, "sqrt", (inner) => `\\sqrt{${inner}}`);

  // ^(...) / _(...) → ^{...} / _{...}
  s = bracketScript(s, "^");
  s = bracketScript(s, "_");
  // ^x / _x （单字符）→ ^{x} / _{x}
  s = s.replace(/\^([A-Za-z0-9])/g, "^{$1}");
  s = s.replace(/_([A-Za-z0-9])/g, "_{$1}");

  // (a)/(b) → \frac{a}{b}
  s = s.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}");
  // 简单 a/b（两侧是数字或单标识符，且不是已在 \frac 里）→ \frac
  s = s.replace(/(\b[A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+\b)/g, "\\frac{$1}{$2}");

  // 符号
  s = s
    .replace(/<=/g, "\\le ")
    .replace(/>=/g, "\\ge ")
    .replace(/!=/g, "\\ne ")
    .replace(/\boo\b/g, "\\infty ")
    .replace(/\bpi\b/g, "\\pi ")
    .replace(/\*/g, "\\cdot ");

  // 三角/对数函数名 → 正体命令（避免已带反斜杠的重复加）
  s = s.replace(/(?<!\\)\b(sin|cos|tan|cot|sec|csc|log|ln|lim|exp)\b/g, "\\$1");

  return s.trim();
}

/** 替换 funcName(...) 形式（支持一层嵌套括号），inner 为括号内内容 */
function replaceFunc(s: string, fn: string, build: (inner: string) => string): string {
  const re = new RegExp(`\\b${fn}\\s*\\(`, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index;
    const open = m.index + m[0].length - 1;
    const close = matchParen(s, open);
    if (close < 0) break;
    out += s.slice(last, start) + build(s.slice(open + 1, close));
    last = close + 1;
    re.lastIndex = last;
  }
  return out + s.slice(last);
}

/** ^(...) / _(...) 带括号的上下标 → ^{...} */
function bracketScript(s: string, sym: "^" | "_"): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    if (s[i] === sym && s[i + 1] === "(") {
      const close = matchParen(s, i + 1);
      if (close >= 0) {
        out += sym + "{" + s.slice(i + 2, close) + "}";
        i = close + 1;
        continue;
      }
    }
    out += s[i];
    i++;
  }
  return out;
}

/** 返回与 openIdx 处 '(' 匹配的 ')' 下标，找不到返回 -1 */
function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const MATH_HINT = /[\^_]|\bsqrt\b|[<>]=|!=|\\[a-zA-Z]|\d\s*\/\s*\d|[=+\-*/]\s*[A-Za-z0-9]/;

/** 发送前：含数学迹象就把整条转 LaTeX 并用 $...$ 包裹；纯文字思路原样返回。
 * 已含 $ 的（学生自己写了 LaTeX）不动。 */
export function maybeWrapMath(text: string): string {
  const t = text.trim();
  if (!t || t.includes("$")) return text;
  // 纯中文/纯自然语言（无明显数学符号）不动
  if (!MATH_HINT.test(t)) return text;
  // 含中文时只包裹明显的数学子串保守处理：整体转换风险大，这里只在「整条基本是公式」时包裹
  const hasCJK = /[一-龥]/.test(t);
  if (hasCJK) return text; // 混中文的让老师自己读，避免误转
  return `$${toLatex(t)}$`;
}
