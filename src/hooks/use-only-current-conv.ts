import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { ConvMessage } from "@/types";
import { getCurrentConvId } from "@/utils/conv-filter";
import { forgetCaptured } from "./use-json";

/**
 * 「只扫描当前对话」开启时，丢掉不属于当前会话的已捕获内容。
 * 返回的函数可在捕获到新内容时调用；打开面板或切换开关时会自动执行一次。
 */
export function useOnlyCurrentConv(
  enabled: boolean,
  isPanelOpen: boolean,
  setMessages: Dispatch<SetStateAction<ConvMessage[]>>,
) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const prune = useCallback(() => {
    if (!enabledRef.current) return;
    const convId = getCurrentConvId();
    setMessages((prev) => {
      const dropped = prev.filter(
        (message) => message.source === "aispace" || message.conversation_id !== convId,
      );
      if (dropped.length === 0) return prev;
      forgetCaptured(dropped);
      const droppedSet = new Set(dropped);
      return prev.filter((message) => !droppedSet.has(message));
    });
  }, [setMessages]);

  useEffect(() => {
    if (isPanelOpen) prune();
  }, [isPanelOpen, enabled, prune]);

  return prune;
}
