import { createContext } from "react";

export interface HistoryContextProps {
  // 当前页面所在会话的ID，打开面板时更新
  currentConvId?: string;
  // 是否正在加载当前会话更早的消息
  isLoadingHistory: boolean;
  toggleLoadHistory: () => void;
}

export const HistoryContext = createContext<HistoryContextProps>({
  isLoadingHistory: false,
  toggleLoadHistory: () => {},
});
