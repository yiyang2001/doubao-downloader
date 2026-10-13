import { createContext } from "react";

export interface HistoryContextProps {
  // 当前页面所在会话的ID，打开面板时更新
  currentConvId?: string;
  // 是否正在加载当前会话更早的消息
  isLoadingHistory: boolean;
  toggleLoadHistory: () => void;
  // 对话下拉框是否以会话ID显示（默认显示首条消息）
  convLabelById?: boolean;
}

export const HistoryContext = createContext<HistoryContextProps>({
  isLoadingHistory: false,
  toggleLoadHistory: () => {},
});
