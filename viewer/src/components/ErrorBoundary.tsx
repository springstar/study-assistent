import { Component, type ReactNode } from "react";

/** 包裹可能在渲染期抛错的子树（如表达式编译失败的 Viz），避免整页白屏 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 20, color: "#c08", fontSize: 13 }}>
            可视化渲染失败：{this.state.error.message}
          </div>
        )
      );
    }
    return this.props.children;
  }
}
