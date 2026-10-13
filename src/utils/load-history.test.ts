import { describe, expect, it } from "vitest";
import { findIndexRailDriver, loadConversationHistory } from "./load-history";

const fakeScroller = (pages: number) => {
  const scroller = { scrollTop: 500, scrollHeight: 1000, clientHeight: 400, isConnected: true };
  let remaining = pages;
  // 每次滚到顶部后，下一轮等待期间加载出一页更早的消息
  const wait = async () => {
    if (scroller.scrollTop === 0 && remaining > 0) {
      remaining--;
      scroller.scrollHeight += 1000;
      scroller.scrollTop = 1000;
    }
  };
  return { scroller, wait };
};

describe("loadConversationHistory", () => {
  it("keeps scrolling to the top until nothing new loads, then returns to the bottom", async () => {
    const { scroller, wait } = fakeScroller(3);
    const result = await loadConversationHistory({
      getCapturedCount: () => 0,
      findScroller: () => scroller,
      wait,
      idleRounds: 2,
    });
    expect(result).toBe("done");
    expect(scroller.scrollHeight).toBe(4000);
    expect(scroller.scrollTop).toBe(4000);
  });

  it("stops when aborted", async () => {
    const { scroller, wait } = fakeScroller(100);
    const controller = new AbortController();
    let rounds = 0;
    const result = await loadConversationHistory({
      signal: controller.signal,
      getCapturedCount: () => 0,
      findScroller: () => scroller,
      wait: async () => {
        await wait();
        if (++rounds === 2) controller.abort();
      },
    });
    expect(result).toBe("aborted");
    expect(scroller.scrollHeight).toBe(3000);
  });

  it("reports when the message list cannot be found", async () => {
    const result = await loadConversationHistory({
      getCapturedCount: () => 0,
      findScroller: () => undefined,
    });
    expect(result).toBe("no-scroller");
  });
});

describe("findIndexRailDriver", () => {
  it("drives the conversation index rail next to the message list", () => {
    document.body.innerHTML = `
      <aside><div><div id="rail" style="overflow-y: auto"><div>
        <button data-index-entry-key="a"></button>
        <button data-index-entry-key="b"></button>
      </div></div></div></aside>`;
    const rail = document.getElementById("rail")!;
    const clicked: string[] = [];
    rail.addEventListener("click", (event) => {
      clicked.push((event.target as HTMLElement).dataset.indexEntryKey!);
    });

    const driver = findIndexRailDriver()!;
    expect(driver.size()).toBe(2);
    rail.scrollTop = 50;
    driver.step(0);
    expect(rail.scrollTop).toBe(0);
    expect(clicked).toEqual([]);
    // 滚动没有带出新内容时跳到最早的一条，结束后回到最新的一条
    driver.step(2);
    driver.finish();
    expect(clicked).toEqual(["a", "b"]);
    document.body.innerHTML = "";
  });

  it("is absent on pages without an index rail", () => {
    expect(findIndexRailDriver()).toBeUndefined();
  });
});
