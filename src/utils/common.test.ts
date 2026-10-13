import { describe, expect, it } from "vitest";
import {
  buildFileName,
  buildFolderName,
  buildZipName,
  completeSuffix,
  replaceTemplate,
  sanitizeFileName,
  uniqueName,
} from "./common";

const DEFAULT_TEMPLATE =
  "${conversation_id}_${message_id}_${index_in_conv}_${creation.image.key}";

describe("replaceTemplate", () => {
  it("fills nested fields", () => {
    expect(
      replaceTemplate(DEFAULT_TEMPLATE, {
        conversation_id: "c1",
        message_id: "m1",
        index_in_conv: 3,
        creation: { image: { key: "k1" } },
      }),
    ).toBe("c1_m1_3_k1");
  });

  it("drops missing fields with their separator instead of writing undefined", () => {
    expect(
      replaceTemplate(DEFAULT_TEMPLATE, {
        message_id: "m1",
        creation: { image: { key: "k1" } },
      }),
    ).toBe("m1_k1");
    expect(replaceTemplate("${a.b.c}-${name}", { name: "x" })).toBe("x");
    expect(replaceTemplate("${index}", { index: 0 })).toBe("0");
  });
});

describe("file name helpers", () => {
  it("only skips the suffix when the extension already matches", () => {
    expect(completeSuffix("photo", "png")).toBe("photo.png");
    expect(completeSuffix("photo.PNG", "png")).toBe("photo.PNG");
    expect(completeSuffix("my-png", "png")).toBe("my-png.png");
  });

  it("removes illegal characters and limits length", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(sanitizeFileName("  line one\nline two.  ")).toBe("line one line two");
    expect(sanitizeFileName("好".repeat(80), 50)).toHaveLength(50);
    expect(sanitizeFileName(undefined)).toBe("");
  });

  it("falls back when the template produces nothing", () => {
    expect(buildFileName("${missing}", {}, "png", "tos/key")).toBe("tos_key.png");
    expect(buildFileName("${missing}", {}, "mp4", "")).toBe("未命名.mp4");
  });

  it("builds a safe folder name", () => {
    expect(buildFolderName("画一只猫: 可爱/写实")).toBe("画一只猫_ 可爱_写实/");
    expect(buildFolderName(undefined, "conversation-1")).toBe("conversation-1/");
    expect(buildFolderName(undefined)).toBe("未命名/");
  });

  it("produces names the browser accepts when writing straight to a folder", () => {
    expect(sanitizeFileName("a\u200db\ufeff")).toBe("ab");
    expect(sanitizeFileName("~draft.")).toBe("draft");
    expect(sanitizeFileName(" . name ~")).toBe("name");
    expect(sanitizeFileName("CON")).toBe("_CON");
    expect(sanitizeFileName("nul.png")).toBe("_nul.png");
    expect(sanitizeFileName("a~b.png")).toBe("a~b.png");
  });

  it("numbers duplicate names", () => {
    const used = new Set<string>();
    expect(uniqueName("a.png", used)).toBe("a.png");
    expect(uniqueName("a.png", used)).toBe("a (2).png");
    expect(uniqueName("A.png", used)).toBe("A (3).png");
  });

  it("names the zip after the conversation and time", () => {
    const date = new Date(2026, 9, 13, 14, 5, 9);
    expect(buildZipName(undefined, { conversation_id: "123", title: "画一只猫" }, date)).toBe(
      "豆包下载_画一只猫_20261013-140509",
    );
    expect(buildZipName("", {}, date)).toBe("豆包下载_20261013-140509");
  });

  it("names the zip from a custom template", () => {
    const date = new Date(2026, 9, 13, 14, 5, 9);
    expect(buildZipName("${conversation_id}", { conversation_id: "123" }, date)).toBe("123");
    expect(buildZipName("${date}_${conversation_id}", { conversation_id: "123" }, date)).toBe(
      "20261013_123",
    );
    // 跨会话下载时没有会话ID，模板结果为空则退回默认模板
    expect(buildZipName("${conversation_id}", {}, date)).toBe("豆包下载_20261013-140509");
  });
});
