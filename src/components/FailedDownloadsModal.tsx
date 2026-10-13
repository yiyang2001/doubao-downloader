import { Button, Modal, Toast } from "@douyinfe/semi-ui-19";
import type { ConvMessage } from "@/types";

export interface FailedDownload {
  url: string;
  filename: string;
  reason: string;
  conv: ConvMessage;
}

interface FailedDownloadsModalProps {
  failures: FailedDownload[];
  onRetry: () => void;
  onClose: () => void;
}

function FailedDownloadsModal({ failures, onRetry, onClose }: FailedDownloadsModalProps) {
  const copyLinks = () => {
    navigator.clipboard
      .writeText(failures.map((item) => item.url).join("\n"))
      .then(() => Toast.success("已复制链接"))
      .catch(() => Toast.error("复制失败"));
  };

  return (
    <Modal
      title={`下载失败 ${failures.length} 个`}
      visible={failures.length > 0}
      onCancel={onClose}
      maskClosable={false}
      width={640}
      getPopupContainer={() =>
        document.getElementById("dd-modal-popup-container") || document.body
      }
      footer={
        <>
          <Button onClick={copyLinks} type="tertiary">复制链接</Button>
          <Button onClick={onClose} type="tertiary">关闭</Button>
          <Button onClick={onRetry} theme="solid">重试失败项</Button>
        </>
      }
    >
      <ul className="dd:m-0 dd:max-h-80 dd:list-none dd:overflow-auto dd:p-0">
        {failures.map((item) => (
          <li
            className="dd:flex dd:items-start dd:gap-3 dd:border-b dd:border-slate-100 dd:py-2 dd:last:border-b-0"
            key={item.url}
          >
            <div className="dd:min-w-0 dd:flex-1">
              <div className="dd:truncate dd:text-sm dd:text-slate-800" title={item.filename}>
                {item.filename}
              </div>
              <div className="dd:mt-1 dd:text-xs dd:text-slate-400">
                创建于 {new Date(item.conv.create_time).toLocaleString()}
              </div>
              <div className="dd:mt-1 dd:break-all dd:text-xs dd:text-red-500">{item.reason}</div>
            </div>
            <a
              className="dd:shrink-0 dd:text-xs"
              href={item.url}
              rel="noreferrer"
              target="_blank"
            >
              打开
            </a>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default FailedDownloadsModal;
