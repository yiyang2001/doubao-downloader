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
  it("keeps scrolling to the top until nothing new loads and stays there", async () => {
    const { scroller, wait } = fakeScroller(3);
    const result = await loadConversationHistory({
      getCapturedCount: () => 0,
      findScroller: () => scroller,
      wait,
      idleRounds: 2,
    });
    expect(result).toBe("done");
    expect(scroller.scrollHeight).toBe(4000);
    expect(scroller.scrollTop).toBe(0);
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
        <button data-index-entry-key="c"></button>
      </div></div></div></aside>`;
    const rail = document.getElementById("rail")!;
    const clicked: string[] = [];
    rail.addEventListener("click", (event) => {
      clicked.push((event.target as HTMLElement).dataset.indexEntryKey!);
    });

    const driver = findIndexRailDriver()!;
    rail.scrollTop = 50;
    driver.step(0);
    expect(rail.scrollTop).toBe(0);
    expect(clicked).toEqual(["a"]);
    // 最早的一条没变时不重复点，长时间没进展才再点一次
    driver.step(1);
    expect(clicked).toEqual(["a"]);
    driver.step(3);
    expect(clicked).toEqual(["a", "a"]);

    // 索引条加载出更早的条目后算作进展，并立刻点新的最早一条
    const before = driver.size();
    rail.firstElementChild!.insertAdjacentHTML("afterbegin", '<button data-index-entry-key="z"></button>');
    expect(driver.size()).not.toBe(before);
    driver.step(0);
    expect(clicked).toEqual(["a", "a", "z"]);
    document.body.innerHTML = "";
  });

  it("is absent on pages without an index rail", () => {
    expect(findIndexRailDriver()).toBeUndefined();
  });
});
