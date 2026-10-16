import { createContext } from "react";

export interface HistoryContextProps {
  // 当前页面所在会话的ID，打开面板时更新
  currentConvId?: string;
  // 是否正在加载当前会话更早的消息
  isLoadingHistory: boolean;
  toggleLoadHistory: () => void;
  // 对话下拉框是否以会话ID显示（默认显示首条消息）
  convLabelById?: boolean;
  // 批量下载：未开启设置时为 undefined，面板上不显示入口
  batchDownload?: { isRunning: boolean; start: () => void; stop: () => void };
}

export const HistoryContext = createContext<HistoryContextProps>({
  isLoadingHistory: false,
  toggleLoadHistory: () => {},
});
