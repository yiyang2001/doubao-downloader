import { useEffect, useRef } from "react";
import type { ConvMessage } from "@/types";

interface UseJsonProps {
  showRaw?: boolean;
  enable15sVideo?: boolean;
  onUpdateVideoDurationSuccess?: () => void;
  onUpdateVideoDurationError?: (error: unknown) => void;
  callback: (messages: ConvMessage[]) => void;
}

function findAllKeysInJson(obj: object, key: string): any[] {
  const results: any[] = [];
  function search(current: any) {
    if (current && typeof current === "object") {
      if (
        !Array.isArray(current) &&
        Object.prototype.hasOwnProperty.call(current, key)
      ) {
        results.push(current[key]);
      }
      const items = Array.isArray(current) ? current : Object.values(current);
      for (const item of items) {
        search(item);
      }
    }
  }
  search(obj);
  return results;
}

function showRawImage(image: any) {
  if (!image) return;
  const rawImage = image.image_ori_raw?.url as string;
  if (rawImage && !rawImage.includes("watermark")) {
    if (image.image_ori) image.image_ori.url = rawImage;
    if (image.image_preview) image.image_preview.url = rawImage;
    if (image.image_thumb) image.image_thumb.url = rawImage;
  }
}

function updateVideoDuration(
  data: any,
  enable15sVideo: boolean,
  onSuccess?: () => void,
  onError?: (error: unknown) => void,
) {
  if (!enable15sVideo) return;
  const chatAbility = data?.chat_ability;
  if (chatAbility?.ability_type !== 17) return;
  try {
    const abilityParam = JSON.parse(chatAbility.ability_param || "{}");
    abilityParam.duration = 15;
    chatAbility.ability_param = JSON.stringify(abilityParam);
    onSuccess?.();
  } catch (error) {
    console.warn("修改视频生成时长失败:", error);
    onError?.(error);
  }
}

function extractCreations({
  creationsArray,
  baseInfo,
  showRaw,
}: {
  creationsArray: unknown[];
  baseInfo?: Partial<ConvMessage>;
  showRaw: boolean;
}): ConvMessage[] {
  const result: ConvMessage[] = [];

  creationsArray.forEach((creations: any) => {
    if (!Array.isArray(creations)) return;
    creations.forEach(async (creation: any) => {
      const isVideoCreation = creation.video && creation.video.vid && true;
      if (isVideoCreation) {
        result.push({
          ...baseInfo,
          creation: {
            creation_type: "video",
            vid: creation.video.vid,
            //image.image_ori_raw.url
            image: {
              key: creation.video.cover.key,
              image_ori_raw: {
                url: creation.video.cover.image_thumb.url,
              },
              gen_params: creation.video.gen_params?.prompt || "",
            },
          },
        } as ConvMessage);
      }
      const image = creation?.image;
      if (!image) return;

      // 原地替换 url
      showRaw && showRawImage(image);

      if (image?.image_ori_raw?.url && baseInfo) {
        result.push({
          ...baseInfo,
          creation: {
            creation_type: "image",
            image: {
              key: image.key,
              image_ori_raw: image.image_ori_raw,
              gen_params: image.gen_params?.prompt || "",
            },
          },
        } as ConvMessage);
      }
    });
  });

  return result;
}

function extractTtsContentText(tts_content: string) {
  try {
    const json = JSON.parse(tts_content);
    if (json.text) {
      return json.text;
    }
  } catch (error) {
    return tts_content;
  }
}

function extractRichMediaVideos(message: any): ConvMessage[] {
  return (message?.content_block || []).flatMap((block: any) => {
    if (Number(block?.block_type) !== 10084) return [];

    return (block?.content?.rich_media_layout_block?.media || []).flatMap(
      (media: any) => {
        const video = media?.creation?.video;
        const vid = video?.vid;
        if (!vid) return [];

        return [
          {
            source: "conversation",
            index_in_conv: Number(message.index_in_conv || 0),
            bot_reply_message_id: String(message.bot_reply_message_id || ""),
            tts_content: extractTtsContentText(String(message.tts_content || "")),
            conversation_id: String(message.conversation_id || ""),
            message_id: String(message.message_id || ""),
            create_time: Number(message.create_time || 0) * 1000,
            creation: {
              creation_type: "video",
              vid: String(vid),
              image: {
                key: String(video.cover?.key || vid),
                image_ori_raw: { url: String(video.cover?.image_thumb?.url || "") },
                gen_params: "",
              },
            },
          },
        ];
      },
    );
  });
}

export function extractAispaceCreations(children: unknown[]): ConvMessage[] {
  return children.flatMap((child: any) => {
    if (!child || (child.node_type !== 4 && child.node_type !== 6)) return [];

    const coverUrl =
      child.node_cover?.list_view?.cover_url ||
      child.node_cover?.thumbnail_view?.cover_url ||
      "";
    const messageId = String(
      child.content?.message_id_str || child.content?.message_id || child.id,
    );
    const baseInfo: ConvMessage = {
      source: "aispace",
      index_in_conv: 0,
      bot_reply_message_id: String(child.id),
      tts_content: child.name || "",
      conversation_id: String(child.conversation_id || ""),
      message_id: messageId,
      create_time: Number(child.create_time || 0) * 1000,
      creation: {
        creation_type: child.node_type === 6 ? "video" : "image",
        node_id: String(child.id),
        image: {
          key: String(child.key || child.id),
          image_ori_raw: { url: coverUrl },
          gen_params: "",
        },
      },
    };

    if (child.node_type === 6) baseInfo.creation.vid = String(child.key || "");
    return [baseInfo];
  });
}

export function isAispaceResponse(data: any): boolean {
  const responseData = data?.data;
  return Boolean(
    Array.isArray(responseData?.children) &&
    Array.isArray(responseData?.path) &&
    responseData.path.some(
      (node: any) => node?.content?.directory_type === 5 || node?.name === "我的创作",
    ),
  );
}

const SHOW_RAW_CACHE_KEY = "doubao-downloader:show_raw";
const ENABLE_15S_VIDEO_CACHE_KEY = "doubao-downloader:enable_15s_video";

function readCachedSetting(key: string, fallback: boolean) {
  try {
    const cached = localStorage.getItem(key);
    return cached === null ? fallback : cached === "true";
  } catch {
    return fallback;
  }
}

function writeCachedSetting(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage 不可用时只是下次启动用默认值
  }
}

// 钩子在脚本启动时安装一次，状态放在模块级，React 挂载后再接管回调和设置
const hook = {
  installed: false,
  showRaw: true,
  enable15sVideo: false,
  onUpdateVideoDurationSuccess: undefined as (() => void) | undefined,
  onUpdateVideoDurationError: undefined as ((error: unknown) => void) | undefined,
  listener: undefined as ((messages: ConvMessage[]) => void) | undefined,
  // React 挂载前捕获到的消息
  pending: [] as ConvMessage[],
  messageIds: new Set<string>(),
  aispaceNodeIds: new Set<string>(),
};

function emit(messages: ConvMessage[]) {
  if (hook.listener) {
    hook.listener(messages);
  } else {
    hook.pending.push(...messages);
  }
}

function getConversationIdFromUrl() {
  return window.location.pathname.match(/\/chat\/(\d+)/)?.[1];
}

function capture(text: string, jsonData: any) {
  const showRaw = hook.showRaw;
  const aispaceChildren = jsonData?.data?.children;
  const isAispace = isAispaceResponse(jsonData);
  if (
    !text.includes("creations") &&
    !text.includes("rich_media_layout_block") &&
    !isAispace
  ) return;
  let messageList = findAllKeysInJson(jsonData, "messages");
  const newConv: ConvMessage[] = [];
  if (isAispace) {
    const newChildren = aispaceChildren.filter((child: any) => {
      const nodeId = String(child?.id || "");
      if (!nodeId || hook.aispaceNodeIds.has(nodeId)) return false;
      hook.aispaceNodeIds.add(nodeId);
      return true;
    });
    newConv.push(...extractAispaceCreations(newChildren));
  } else if (messageList.length === 0 && jsonData.message_id) {
    // 实时对话
    const message_id = jsonData.message_id;
    let creations = findAllKeysInJson(jsonData, "creations");
    if (creations.length > 0) {
      // 实时消息不带会话信息，会话ID取自响应或当前地址，时间取当前时间
      const conversation_id =
        jsonData.conversation_id || getConversationIdFromUrl();
      const baseInfo: Partial<ConvMessage> = {
        message_id,
        source: "conversation",
        create_time: Date.now(),
      };
      if (conversation_id) baseInfo.conversation_id = String(conversation_id);
      const extracted = extractCreations({
        creationsArray: creations,
        baseInfo,
        showRaw,
      });
      newConv.push(...extracted);
    }
  } else {
    messageList.map((messages) =>
      messages.map((message: any) => {
        // 消息ID
        let creationList = findAllKeysInJson(message, "creations");
        const message_id = message.message_id;
        if (!hook.messageIds.has(message_id)) {
          hook.messageIds.add(message_id);

          const baseInfo: Partial<ConvMessage> = {
            source: "conversation",
            index_in_conv: Number(message.index_in_conv),
            bot_reply_message_id: message.bot_reply_message_id,
            tts_content: extractTtsContentText(message.tts_content),
            conversation_id: message.conversation_id,
            message_id,
            create_time: message.create_time * 1000,
          };
          if (creationList.length > 0) {
            const extracted = extractCreations({
              creationsArray: creationList,
              baseInfo,
              showRaw,
            });
            newConv.push(...extracted);
          }
          const richMediaVideos = extractRichMediaVideos(message);
          newConv.push(...richMediaVideos);
          if (creationList.length === 0 && richMediaVideos.length === 0) {
            newConv.push(baseInfo as ConvMessage);
          }
        } else {
          // 显示原图
          extractCreations({
            creationsArray: creationList,
            showRaw,
          });
        }
      }),
    );
  }
  emit(newConv);
}

/** Patch JSON.parse / JSON.stringify once. Safe to call repeatedly. */
export function installJsonHook() {
  if (hook.installed) return;
  hook.installed = true;
  hook.showRaw = readCachedSetting(SHOW_RAW_CACHE_KEY, true);
  hook.enable15sVideo = readCachedSetting(ENABLE_15S_VIDEO_CACHE_KEY, false);

  const _parse = JSON.parse;
  const _stringify = JSON.stringify;
  window.origin_parse = JSON.parse;
  window.origin_stringify = JSON.stringify;
  JSON.stringify = ((value: any, replacer?: any, space?: any) => {
    updateVideoDuration(
      value,
      hook.enable15sVideo,
      hook.onUpdateVideoDurationSuccess,
      hook.onUpdateVideoDurationError,
    );
    return _stringify(value, replacer, space);
  }) as typeof JSON.stringify;
  JSON.parse = function (
    text: string,
    reviver?: (this: any, key: string, value: any) => any,
  ) {
    const jsonData = _parse(text, reviver);
    if (typeof text !== "string") return jsonData;
    // 提取失败不能影响页面自身的 JSON.parse
    try {
      capture(text, jsonData);
    } catch (error) {
      console.warn("豆包下载器: 解析响应失败", error);
    }
    return jsonData;
  };
}

/** Restore the native functions and forget captured state. Used by tests. */
export function uninstallJsonHook() {
  if (!hook.installed) return;
  JSON.parse = window.origin_parse;
  JSON.stringify = window.origin_stringify;
  hook.installed = false;
  hook.listener = undefined;
  hook.onUpdateVideoDurationSuccess = undefined;
  hook.onUpdateVideoDurationError = undefined;
  hook.pending = [];
  hook.messageIds.clear();
  hook.aispaceNodeIds.clear();
}

export function useJson({
  showRaw,
  enable15sVideo,
  onUpdateVideoDurationSuccess,
  onUpdateVideoDurationError,
  callback,
}: UseJsonProps) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    installJsonHook();
    const listener = (messages: ConvMessage[]) => callbackRef.current(messages);
    hook.listener = listener;
    const pending = hook.pending.splice(0);
    if (pending.length > 0) listener(pending);
    return () => {
      if (hook.listener === listener) hook.listener = undefined;
    };
  }, []);

  // 设置未加载完成时为 undefined，此时沿用上次缓存的值
  useEffect(() => {
    if (showRaw !== undefined) {
      hook.showRaw = showRaw;
      writeCachedSetting(SHOW_RAW_CACHE_KEY, showRaw);
    }
    if (enable15sVideo !== undefined) {
      hook.enable15sVideo = enable15sVideo;
      writeCachedSetting(ENABLE_15S_VIDEO_CACHE_KEY, enable15sVideo);
    }
    hook.onUpdateVideoDurationSuccess = onUpdateVideoDurationSuccess;
    hook.onUpdateVideoDurationError = onUpdateVideoDurationError;
  }, [showRaw, enable15sVideo, onUpdateVideoDurationSuccess, onUpdateVideoDurationError]);
}

