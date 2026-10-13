import { describe, expect, it } from "vitest";
import type { ConvMessage } from "@/types";
import { buildConvOptions, matchesConvScope, matchesConvSearch } from "./conv-filter";

const message = (source?: ConvMessage["source"], conversation_id = "conversation"): ConvMessage => ({
  source,
  index_in_conv: 1,
  bot_reply_message_id: "reply",
  tts_content: "content",
  conversation_id,
  message_id: "message",
  create_time: 1,
  creation: {
    creation_type: "image",
    image: { image_ori_raw: { url: "https://example.test/image.jpg" }, key: "image", gen_params: "" },
  },
});

describe("conversation options", () => {
  const withFields = (fields: Partial<ConvMessage>): ConvMessage => ({
    ...message(undefined, "conversation"),
    ...fields,
  });

  it("labels each conversation with its id", () => {
    const options = buildConvOptions([
      withFields({ conversation_id: "123", tts_content: "some prompt" }),
      withFields({ conversation_id: "456", tts_content: undefined as unknown as string }),
    ]);
    expect(options).toEqual([
      { id: "123", label: "123" },
      { id: "456", label: "456" },
    ]);
  });

  it("lists each conversation once and skips aispace and media-less ones", () => {
    const options = buildConvOptions([
      withFields({ conversation_id: "a", tts_content: "first" }),
      withFields({ conversation_id: "a", tts_content: "first" }),
      withFields({ conversation_id: "b", source: "aispace" }),
      { ...withFields({ conversation_id: "c" }), creation: undefined } as unknown as ConvMessage,
    ]);
    expect(options).toEqual([{ id: "a", label: "a" }]);
  });
});

describe("conversation search", () => {
  it("matches by option text and always keeps the current conversation", () => {
    expect(matchesConvSearch("384", "38418425446052625")).toBe(true);
    expect(matchesConvSearch("999", "38418425446052625")).toBe(false);
    expect(matchesConvSearch("999", "38418425446052625", "38418425446052625")).toBe(true);
    expect(matchesConvSearch("创作", "aispace")).toBe(true);
    expect(matchesConvSearch("所有", "-1")).toBe(true);
    expect(matchesConvSearch("创作", "-1")).toBe(false);
  });
});

describe("conversation filter scopes", () => {
  it("keeps aispace creations out of all conversations", () => {
    expect(matchesConvScope(message("aispace"), "-1")).toBe(false);
    expect(matchesConvScope(message(undefined), "-1")).toBe(true);
  });

  it("matches aispace independently from conversation IDs", () => {
    expect(matchesConvScope(message("aispace", "some-conversation"), "aispace")).toBe(true);
    expect(matchesConvScope(message("aispace"), "conversation")).toBe(false);
    expect(matchesConvScope(message(undefined), "conversation")).toBe(true);
  });
});
