import { afterEach, describe, expect, it } from "vitest";
import { findNextConvId, listSidebarConvLinks, openConv } from "./conv-navigation";

const sidebar = (...ids: string[]) => {
  document.body.innerHTML = `
    <nav>${ids.map((id) => `<a href="/chat/${id}">chat ${id}</a>`).join("")}</nav>
    <div id="doubao-downloader"><a href="/chat/999">ours</a></div>`;
};

afterEach(() => {
  document.body.innerHTML = "";
  window.history.pushState({}, "", "/");
});

describe("sidebar conversations", () => {
  it("lists each conversation once in page order and ignores the downloader's own links", () => {
    sidebar("3", "1", "3", "2");
    expect([...listSidebarConvLinks().keys()]).toEqual(["3", "1", "2"]);
  });

  it("finds the next conversation below the current one, skipping visited ones", async () => {
    sidebar("1", "2", "3", "4");
    const wait = async () => {};
    expect(await findNextConvId("2", new Set(["2"]), { wait })).toBe("3");
    expect(await findNextConvId("2", new Set(["2", "3"]), { wait })).toBe("4");
    expect(await findNextConvId("4", new Set(["4"]), { wait })).toBeUndefined();
  });

  it("opens a conversation by clicking its link and waits for the address to change", async () => {
    sidebar("1", "2");
    listSidebarConvLinks().get("2")!.addEventListener("click", (event) => {
      event.preventDefault();
      setTimeout(() => window.history.pushState({}, "", "/chat/2"), 0);
    });
    expect(await openConv("2", { wait: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))) })).toBe(true);
    expect(await openConv("7")).toBe(false);
  });
});
