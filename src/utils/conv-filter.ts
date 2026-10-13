import type { ConvMessage } from "@/types";

export const ALL_CONVERSATIONS_FILTER = "-1";
export const AISPACE_FILTER = "aispace";

export type ConvOption = { id: string; label: string };

/** 会话的首条消息文本，还没捕获到时返回 undefined。 */
export function getConvTitle(messages: ConvMessage[], conversationId: string) {
  const first = messages.find(
    (message) =>
      message.source !== "aispace" &&
      message.conversation_id === conversationId &&
      message.index_in_conv === 1,
  );
  return (typeof first?.tts_content === "string" && first.tts_content.trim()) || undefined;
}

/**
 * 每个含有图片/视频的会话一项。
 * 默认以首条消息显示（没捕获到首条消息时退回会话ID），byId 为 true 时一律显示会话ID。
 */
export function buildConvOptions(messages: ConvMessage[], byId = false): ConvOption[] {
  const ids: string[] = [];
  for (const message of messages) {
    const id = message.conversation_id;
    if (message.source === "aispace" || !message.creation || !id) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => ({ id, label: (!byId && getConvTitle(messages, id)) || id }));
}

/** 当前页面所在会话的ID，不在会话页时返回 undefined。 */
export function getCurrentConvId() {
  return window.location.pathname.match(/\/chat\/(\d+)/)?.[1];
}

/** 下拉框搜索：按选项文字匹配，当前会话始终保留。 */
export function matchesConvSearch(
  input: string,
  value: string,
  currentConvId?: string,
  label?: string,
) {
  if (value === currentConvId) return true;
  const text =
    value === ALL_CONVERSATIONS_FILTER ? "所有对话" : value === AISPACE_FILTER ? "我的创作" : value;
  // 会话ID和显示的文字都可以搜
  return `${text}\n${label || ""}`.toLowerCase().includes(input.trim().toLowerCase());
}

export function matchesConvScope(message: ConvMessage, selectedScope: string) {
  if (selectedScope === AISPACE_FILTER) return message.source === "aispace";
  if (message.source === "aispace") return false;
  if (selectedScope === ALL_CONVERSATIONS_FILTER) return true;
  return message.conversation_id === selectedScope;
}
