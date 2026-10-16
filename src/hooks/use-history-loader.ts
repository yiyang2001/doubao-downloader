import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Toast } from "@douyinfe/semi-ui-19";
import { getCurrentConvId } from "@/utils/conv-filter";
import { loadConversationHistory, type LoadHistoryResult } from "@/utils/load-history";

interface UseHistoryLoaderProps {
  isPanelOpen: boolean;
  /** 已捕获的媒体数量 */
  mediaCount: number;
  /** 打开面板时自动选中当前会话 */
  autoSelect: boolean;
  /** 打开面板时自动加载当前会话更早的消息 */
  autoLoad: boolean;
  onSelectConv: (convId: string) => void;
}

/** 当前会话的识别，以及加载它更早消息的开始/停止。 */
export function useHistoryLoader({
  isPanelOpen,
  mediaCount,
  autoSelect,
  autoLoad,
  onSelectConv,
}: UseHistoryLoaderProps) {
  const [currentConvId, setCurrentConvId] = useState<string>();
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const loaderRef = useRef<AbortController | undefined>(undefined);
  // 已经自动加载过历史的会话，再次打开面板时不重复加载
  const autoLoadedConvIds = useRef(new Set<string>());
  const mediaCountRef = useRef(0);
  mediaCountRef.current = mediaCount;
  const optionsRef = useRef({ autoSelect, autoLoad, onSelectConv });
  optionsRef.current = { autoSelect, autoLoad, onSelectConv };

  const start = useCallback(async (convId: string): Promise<LoadHistoryResult | undefined> => {
    loaderRef.current?.abort();
    const controller = new AbortController();
    loaderRef.current = controller;
    autoLoadedConvIds.current.add(convId);
    setIsLoadingHistory(true);
    const before = mediaCountRef.current;
    const result = await loadConversationHistory({
      signal: controller.signal,
      getCapturedCount: () => mediaCountRef.current,
      keepGoing: () => getCurrentConvId() === convId,
    });
    // 被新的加载顶替时，结果交给新的那次
    if (loaderRef.current !== controller) return undefined;
    loaderRef.current = undefined;
    setIsLoadingHistory(false);
    if (result === "no-scroller") {
      Toast.warning("没有找到对话的消息列表");
    } else if (result === "done") {
      Toast.success(`已加载到对话开头，新增 ${mediaCountRef.current - before} 个媒体`);
    }
    return result;
  }, []);

  const stop = useCallback(() => loaderRef.current?.abort(), []);

  const toggleLoadHistory = useCallback(() => {
    if (loaderRef.current) {
      loaderRef.current.abort();
      return;
    }
    const convId = getCurrentConvId();
    setCurrentConvId(convId);
    if (!convId) {
      Toast.warning("请先打开一个对话");
      return;
    }
    start(convId);
  }, [start]);

  // 用 layout effect 在面板画出来之前切换，避免先闪一下上一个会话的图片
  useLayoutEffect(() => {
    if (!isPanelOpen) return;
    const convId = getCurrentConvId();
    setCurrentConvId(convId);
    if (!convId) return;
    if (optionsRef.current.autoSelect) optionsRef.current.onSelectConv(convId);
    if (optionsRef.current.autoLoad && !autoLoadedConvIds.current.has(convId)) start(convId);
  }, [isPanelOpen, start]);

  return {
    currentConvId,
    isLoadingHistory,
    toggleLoadHistory,
    /** 加载指定会话的历史，加载结束后返回 */
    load: start,
    stop,
    /** 是否正在加载历史，供不随渲染更新的回调读取 */
    loaderRef,
  };
}
