import { Button, Modal, Progress } from "@douyinfe/semi-ui-19";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DownloadJobInfo } from "@/hooks/use-download-queue";

// 收起时最多显示的排队任务数
const COLLAPSED_QUEUE_ROWS = 5;

const POSITION_KEY = "doubao-downloader:progress_position";
type Position = { x: number; y: number };

function readPosition(): Position | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    return Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? saved : undefined;
  } catch {
    return undefined;
  }
}

// 浮窗至少留一部分在屏幕内，免得拖出去之后找不回来
function clampPosition({ x, y }: Position, width: number): Position {
  return {
    x: Math.min(Math.max(x, 8 - width + 80), window.innerWidth - 80),
    y: Math.min(Math.max(y, 8), window.innerHeight - 40),
  };
}

interface ProgressModalProps {
  isDownloading: boolean;
  progress: {
    current: number;
    total: number;
    percentage: number;
    retrying?: number;
  };
  /** 排队下载时改成不遮挡操作的可拖动浮窗，默认在右上角 */
  floating?: boolean;
  /** 正在下载的任务 */
  current?: DownloadJobInfo;
  /** 队列里等待中的任务，按执行顺序 */
  queue?: DownloadJobInfo[];
  onCancel?: () => void;
  onClearQueue?: () => void;
  onRemoveQueued?: (id: number) => void;
}

function ProgressModal({
  isDownloading,
  progress,
  floating,
  current,
  queue = [],
  onCancel,
  onClearQueue,
  onRemoveQueued,
}: ProgressModalProps) {
  const queued = queue.length;
  const [showAllQueue, setShowAllQueue] = useState(false);
  // 拖动过之后记住位置，没拖过时停在右上角
  const [position, setPosition] = useState(readPosition);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | undefined>(undefined);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || event.button !== 0) return;
    const rect = card.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!dragRef.current || !card) return;
    setPosition(
      clampPosition(
        { x: event.clientX - dragRef.current.dx, y: event.clientY - dragRef.current.dy },
        card.offsetWidth,
      ),
    );
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = undefined;
    setPosition((current) => {
      try {
        if (current) localStorage.setItem(POSITION_KEY, JSON.stringify(current));
      } catch {
        // 存不下来只是下次回到默认位置
      }
      return current;
    });
  };
  const strokeArr = [
    { percent: 0, color: "rgb(249, 57, 32)" },
    { percent: 50, color: "#46259E" },
    { percent: 100, color: "hsla(125, 50%, 46% / 1)" },
  ];

  if (!isDownloading) return null;

  const body = (
    <>
      <Progress percent={progress.percentage} showInfo stroke={strokeArr}></Progress>
      <div className="dd:mt-2 dd:text-xs dd:text-slate-500">
        已完成 {progress.current} / {progress.total}
        {queued > 0 && <span className="dd:ml-2">队列中还有 {queued} 个任务</span>}
        {progress.retrying ? (
          <div className="dd:mt-1 dd:text-amber-600">
            {progress.retrying} 个请求超时或出错，正在后台重试（最多 5 次）
          </div>
        ) : null}
      </div>
    </>
  );

  const actions = (
    <>
      {queued > 0 && onClearQueue && (
        <Button onClick={onClearQueue} size={floating ? "small" : "default"} type="tertiary">
          清空队列
        </Button>
      )}
      {onCancel && (
        <Button onClick={onCancel} size={floating ? "small" : "default"} type="danger">
          {queued > 0 ? "取消当前任务" : "取消下载"}
        </Button>
      )}
    </>
  );

  if (floating) {
    // 窗口缩小后，之前记住的位置可能已经在屏幕外
    const placed = position && clampPosition(position, 300);
    // 浮窗用内联样式：它直接挂在宿主页面上，不能指望页面的样式不来干扰
    return (
      <div
        ref={cardRef}
        role="status"
        style={{
          position: "fixed",
          ...(placed ? { left: placed.x, top: placed.y } : { right: 20, top: 20 }),
          // 要盖在面板和设置窗口之上
          zIndex: 2000,
          width: 300,
          boxSizing: "border-box",
          padding: "14px 16px 10px",
          borderRadius: 12,
          border: "1px solid var(--semi-color-border, rgba(0, 0, 0, 0.08))",
          background: "var(--semi-color-bg-3, #fff)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
          color: "var(--semi-color-text-0, #1c1f23)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div
          onPointerCancel={endDrag}
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={endDrag}
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            // 标题这一行是拖动把手
            cursor: "move",
            touchAction: "none",
            userSelect: "none",
          }}
          title="按住拖动"
        >
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 600,
            }}
            title={current?.label}
          >
            正在下载{current ? ` ${current.label}` : ""}
          </span>
          <span
            style={{
              color: "var(--semi-color-text-2, #6b7075)",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {progress.current} / {progress.total} · {progress.percentage}%
          </span>
        </div>
        <div
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress.percentage}
          role="progressbar"
          style={{
            height: 6,
            margin: "10px 0 8px",
            borderRadius: 3,
            overflow: "hidden",
            background: "var(--semi-color-fill-1, #eef0f3)",
          }}
        >
          <div
            style={{
              width: `${progress.percentage}%`,
              height: "100%",
              borderRadius: 3,
              background: "var(--semi-color-primary, #0064fa)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        {progress.retrying ? (
          <div style={{ color: "var(--semi-color-warning, #c88a00)", fontSize: 12 }}>
            {progress.retrying} 个超时或出错，后台重试中
          </div>
        ) : null}
        {queued > 0 && (
          <ol
            style={{
              // 展开后显示整个队列，只在快超出屏幕时才滚动
              maxHeight: showAllQueue ? "calc(100vh - 220px)" : COLLAPSED_QUEUE_ROWS * 24 + 6,
              margin: "4px 0 0",
              padding: "6px 0 0",
              overflowY: "auto",
              listStyle: "none",
              borderTop: "1px solid var(--semi-color-border, rgba(0, 0, 0, 0.08))",
              fontSize: 12,
            }}
          >
            {queue.map((job, index) => (
              <li
                key={job.id}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 24 }}
              >
                <span style={{ color: "var(--semi-color-text-2, #6b7075)" }}>{index + 1}.</span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={job.label}
                >
                  {job.label}
                </span>
                <span style={{ color: "var(--semi-color-text-2, #6b7075)" }}>{job.count} 个</span>
                {onRemoveQueued && (
                  <button
                    aria-label={`从队列移除 ${job.label}`}
                    onClick={() => onRemoveQueued(job.id)}
                    style={{
                      padding: "0 4px",
                      border: "none",
                      background: "none",
                      color: "var(--semi-color-text-2, #6b7075)",
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                    type="button"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 28,
          }}
        >
          <span style={{ color: "var(--semi-color-text-2, #6b7075)", fontSize: 12 }}>
            {queued > 0 ? `排队中 ${queued} 个任务` : ""}
            {queued > COLLAPSED_QUEUE_ROWS && (
              <button
                onClick={() => setShowAllQueue((value) => !value)}
                style={{
                  marginLeft: 6,
                  padding: 0,
                  border: "none",
                  background: "none",
                  color: "var(--semi-color-primary, #0064fa)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
                type="button"
              >
                {showAllQueue ? "收起" : "展开全部"}
              </button>
            )}
          </span>
          <span style={{ display: "flex", gap: 4, marginRight: -8 }}>
            {queued > 0 && onClearQueue && (
              <Button onClick={onClearQueue} size="small" theme="borderless" type="tertiary">
                清空队列
              </Button>
            )}
            {onCancel && (
              <Button onClick={onCancel} size="small" theme="borderless" type="danger">
                {queued > 0 ? "取消当前" : "取消"}
              </Button>
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Modal
      title="正在下载"
      visible={isDownloading}
      closable={false}
      closeOnEsc={false}
      footer={actions}
      maskClosable={false}
      getPopupContainer={() =>
        document.getElementById("dd-modal-popup-container") || document.body
      }
      bodyStyle={{
        padding: "10px",
        paddingBottom: "30px",
      }}
    >
      {body}
    </Modal>
  );
}

export default ProgressModal;
