import { Button } from "@douyinfe/semi-ui-19";
import type { BatchPhase, BatchState } from "@/hooks/use-batch-download";

const PHASE_TEXT: Record<BatchPhase, string> = {
  loading: "正在加载历史消息",
  downloading: "正在下载",
  switching: "正在打开下一个对话",
};

interface BatchDownloadWidgetProps {
  state?: BatchState;
  onStop: () => void;
}

/** 批量下载期间显示在左下角的小窗，可以随时停止。 */
function BatchDownloadWidget({ state, onStop }: BatchDownloadWidgetProps) {
  if (!state) return null;
  const muted = { color: "var(--semi-color-text-2, #6b7075)", fontSize: 12 };

  // 浮窗直接挂在宿主页面上，用内联样式避免被页面样式干扰
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: 20,
        bottom: 20,
        zIndex: 2000,
        width: 280,
        boxSizing: "border-box",
        padding: "12px 16px 8px",
        borderRadius: 12,
        border: "1px solid var(--semi-color-border, rgba(0, 0, 0, 0.08))",
        background: "var(--semi-color-bg-3, #fff)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
        color: "var(--semi-color-text-0, #1c1f23)",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 600 }}>批量下载中 · 第 {state.index} 个对话</div>
      <div style={{ ...muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {state.convId}
      </div>
      <div style={{ marginTop: 4 }}>{PHASE_TEXT[state.phase]}…</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={muted}>
          已完成 {state.finished} 个对话 · {state.files} 个文件
        </span>
        <Button onClick={onStop} size="small" style={{ marginRight: -8 }} theme="borderless" type="danger">
          停止
        </Button>
      </div>
    </div>
  );
}

export default BatchDownloadWidget;
