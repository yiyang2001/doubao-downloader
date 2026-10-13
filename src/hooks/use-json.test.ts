import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractAispaceCreations,
  installJsonHook,
  isAispaceResponse,
  uninstallJsonHook,
  useJson,
} from "./use-json";

afterEach(() => {
  uninstallJsonHook();
  localStorage.clear();
  vi.restoreAllMocks();
});

const historyResponse = (messageId: string) =>
  JSON.stringify({
    messages: [
      {
        conversation_id: "conversation-1",
        message_id: messageId,
        index_in_conv: "2",
        create_time: "100",
        bot_reply_message_id: "reply-1",
        tts_content: "reply",
        creations: [
          {
            image: {
              key: `${messageId}-key`,
              image_ori_raw: { url: "https://example.test/raw.png" },
              image_thumb: { url: "https://example.test/watermarked.png" },
            },
          },
        ],
      },
    ],
  });

describe("early hook installation", () => {
  it("buffers messages captured before React mounts", () => {
    installJsonHook();
    JSON.parse(historyResponse("early-message"));

    const callback = vi.fn();
    const { unmount } = renderHook(() => useJson({ callback }));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        message_id: "early-message",
        creation: expect.objectContaining({ creation_type: "image" }),
      }),
    ]);
    unmount();
  });

  it("keeps the hook installed when settings change and applies them", () => {
    const callback = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ showRaw }: { showRaw?: boolean }) => useJson({ callback, showRaw }),
      { initialProps: { showRaw: false } as { showRaw?: boolean } },
    );
    const installedParse = JSON.parse;

    const untouched = JSON.parse(historyResponse("message-a"));
    expect(untouched.messages[0].creations[0].image.image_thumb.url).toBe(
      "https://example.test/watermarked.png",
    );

    rerender({ showRaw: true });
    expect(JSON.parse).toBe(installedParse);
    const replaced = JSON.parse(historyResponse("message-b"));
    expect(replaced.messages[0].creations[0].image.image_thumb.url).toBe(
      "https://example.test/raw.png",
    );
    unmount();
  });

  it("remembers show_raw across page loads until settings are loaded", () => {
    const first = renderHook(() => useJson({ callback: vi.fn(), showRaw: false }));
    first.unmount();
    uninstallJsonHook();

    installJsonHook();
    const parsed = JSON.parse(historyResponse("message-c"));
    expect(parsed.messages[0].creations[0].image.image_thumb.url).toBe(
      "https://example.test/watermarked.png",
    );
  });

  it("gives realtime messages a creation time", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useJson({ callback }));

    act(() => {
      JSON.parse(
        JSON.stringify({
          message_id: "realtime-message",
          conversation_id: "conversation-9",
          creations: [
            {
              image: {
                key: "realtime-key",
                image_ori_raw: { url: "https://example.test/realtime.png" },
              },
            },
          ],
        }),
      );
    });

    const [message] = callback.mock.calls[0][0];
    expect(message.conversation_id).toBe("conversation-9");
    expect(Number.isFinite(message.create_time)).toBe(true);
    unmount();
  });
});

describe("aispace creation extraction", () => {
  it("recognizes paginated responses when node_info is null", () => {
    expect(isAispaceResponse({
      data: {
        node_info: null,
        children: [{ id: "page-2-node", node_type: 4 }],
        path: [{ name: "我的创作", content: { directory_type: 5 } }],
      },
    })).toBe(true);
    expect(isAispaceResponse({ data: { children: [{ id: "other-node" }] } })).toBe(false);
  });

  it("maps image and video children into independent ConvMessages", () => {
    const messages = extractAispaceCreations([
      {
        id: "image-node",
        name: "image.png",
        key: "image-key",
        node_type: 4,
        conversation_id: "image-conversation",
        create_time: 100,
        node_cover: { thumbnail_view: { cover_url: "https://example.test/image.jpg" } },
      },
      {
        id: "video-node",
        name: "video.mp4",
        key: "video-vid",
        node_type: 6,
        conversation_id: "video-conversation",
        create_time: 200,
        node_cover: { list_view: { cover_url: "https://example.test/video.jpg" } },
      },
    ]);

    expect(messages).toEqual([
      expect.objectContaining({
        source: "aispace",
        message_id: "image-node",
        conversation_id: "image-conversation",
        create_time: 100000,
        creation: expect.objectContaining({
          creation_type: "image",
          image: expect.objectContaining({
            key: "image-key",
            image_ori_raw: { url: "https://example.test/image.jpg" },
          }),
        }),
      }),
      expect.objectContaining({
        source: "aispace",
        message_id: "video-node",
        conversation_id: "video-conversation",
        create_time: 200000,
        creation: expect.objectContaining({
          creation_type: "video",
          vid: "video-vid",
          node_id: "video-node",
          image: expect.objectContaining({
            key: "video-vid",
            image_ori_raw: { url: "https://example.test/video.jpg" },
          }),
        }),
      }),
    ]);
  });
});

describe("JSON.parse hook safety", () => {
  it("keeps native behavior for revivers and non-string input", () => {
    const { unmount } = renderHook(() => useJson({ callback: vi.fn() }));

    expect(
      JSON.parse('{"a":1}', (_key, value) =>
        typeof value === "number" ? value + 1 : value,
      ),
    ).toEqual({ a: 2 });
    expect(JSON.parse(123 as unknown as string)).toBe(123);
    expect(JSON.parse(null as unknown as string)).toBeNull();
    unmount();
  });

  it("returns parsed data when extraction throws", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const callback = vi.fn();
    const { unmount } = renderHook(() => useJson({ callback }));
    const text = '{"messages":[null],"note":"creations"}';

    expect(JSON.parse(text)).toEqual({ messages: [null], note: "creations" });
    expect(callback).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    unmount();
  });
});

describe("conversation rich media extraction", () => {
  it("captures video resources from downlink messages by vid without using download_url", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useJson({ callback }));
    const response = {
      cmd: 3100,
      downlink_body: {
        pull_singe_chain_downlink_body: {
          messages: [
            {
              conversation_id: "conversation-1",
              message_id: "message-1",
              index_in_conv: "8",
              create_time: "1791616320",
              bot_reply_message_id: "reply-1",
              tts_content: "Video generated",
              content_block: [
                {
                  block_type: 10084,
                  content: {
                    rich_media_layout_block: {
                      media: [
                        {
                          type: 6,
                          creation: {
                            type: 2,
                            video: {
                              vid: "video-vid",
                              download_url: "https://example.test/direct.mp4",
                              cover: {
                                key: "video-cover-key",
                                image_thumb: { url: "https://example.test/cover.jpg" },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    act(() => {
      JSON.parse(JSON.stringify(response));
    });

    expect(callback).toHaveBeenCalledWith([
      {
        source: "conversation",
        index_in_conv: 8,
        bot_reply_message_id: "reply-1",
        tts_content: "Video generated",
        conversation_id: "conversation-1",
        message_id: "message-1",
        create_time: 1791616320000,
        creation: {
          creation_type: "video",
          vid: "video-vid",
          image: {
            key: "video-cover-key",
            image_ori_raw: { url: "https://example.test/cover.jpg" },
            gen_params: "",
          },
        },
      },
    ]);
    expect(JSON.stringify(callback.mock.calls[0][0])).not.toContain("direct.mp4");
    unmount();
  });
});
