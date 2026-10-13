const OWN_UI_SELECTOR = ".semi-portal, .semi-modal-wrap, #dd-modal-popup-container";
const INDEX_ENTRY_SELECTOR = "button[data-index-entry-key]";

type Scroller = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight" | "isConnected">;

/** 一种把页面推向更早消息的方式。 */
export interface HistoryDriver {
  isConnected: () => boolean;
  /** 向更早的方向推进一步，idle 为已经连续多少轮没有新内容 */
  step: (idle: number) => void;
  /** 页面已加载内容的量，变化说明还在加载 */
  size: () => number | string;
}

function isScrollable(el: Element) {
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

/** 页面上可见面积最大的纵向滚动容器，即会话的消息列表。 */
export function findChatScroller(): HTMLElement | undefined {
  let best: HTMLElement | undefined;
  let bestArea = 0;
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    if (el.clientHeight < 200 || el.scrollHeight <= el.clientHeight + 1) continue;
    if (el.closest(OWN_UI_SELECTOR)) continue;
    if (!isScrollable(el)) continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

// column-reverse 的列表最新消息在 scrollTop = 0，往上是负值
function isReversed(el: Scroller) {
  return (
    el instanceof HTMLElement && getComputedStyle(el).flexDirection === "column-reverse"
  );
}

function scrollToOldest(el: Scroller) {
  el.scrollTop = isReversed(el) ? el.clientHeight - el.scrollHeight : 0;
}

function scrollerDriver(scroller: Scroller): HistoryDriver {
  return {
    isConnected: () => scroller.isConnected,
    step: () => scrollToOldest(scroller),
    size: () => scroller.scrollHeight,
  };
}

// 页面可能监听的是按下/悬停而不是 click，所以把一次完整的鼠标操作都派发出去
function press(el: HTMLElement) {
  const Pointer = typeof PointerEvent === "undefined" ? MouseEvent : PointerEvent;
  const init = { bubbles: true, cancelable: true };
  el.dispatchEvent(new Pointer("pointerover", init));
  el.dispatchEvent(new MouseEvent("mouseover", init));
  el.dispatchEvent(new Pointer("pointerdown", init));
  el.dispatchEvent(new MouseEvent("mousedown", init));
  el.dispatchEvent(new Pointer("pointerup", init));
  el.dispatchEvent(new MouseEvent("mouseup", init));
  el.click();
}

/**
 * 消息列表旁边的会话索引条（每条提问一个小横条，点击即跳到那条消息）。
 * 它一开始只列出一部分条目，点击或滑动到最早的一条后才会加载出更早的。
 * 所以每一步都去够最早的那一条，同时把消息列表也滚到顶，哪种方式能触发加载都不落下。
 */
export function findIndexRailDriver(): HistoryDriver | undefined {
  let el = document.querySelector<HTMLElement>(INDEX_ENTRY_SELECTOR)?.parentElement;
  while (el && !isScrollable(el)) el = el.parentElement;
  if (!el) return undefined;

  const rail = el;
  const entries = () => Array.from(rail.querySelectorAll<HTMLElement>(INDEX_ENTRY_SELECTOR));
  let chat = findChatScroller();
  let pressedKey: string | undefined;
  return {
    isConnected: () => rail.isConnected,
    step: (idle) => {
      rail.scrollTop = 0;
      const earliest = entries()[0];
      const key = earliest?.dataset.indexEntryKey;
      // 出现了更早的条目就立刻点它；一直没有进展时每隔几轮再点一次
      if (earliest && (key !== pressedKey || (idle > 0 && idle % 3 === 0))) {
        pressedKey = key;
        press(earliest);
      }
      if (chat && !chat.isConnected) chat = findChatScroller();
      if (chat) scrollToOldest(chat);
    },
    size: () => `${entries().length}|${entries()[0]?.dataset.indexEntryKey}|${chat?.scrollHeight}`,
  };
}

function findDriver(): HistoryDriver | undefined {
  const rail = findIndexRailDriver();
  if (rail) return rail;
  const scroller = findChatScroller();
  return scroller && scrollerDriver(scroller);
}

interface LoadHistoryOptions {
  signal?: AbortSignal;
  /** 返回 false 时提前结束，例如页面已切换到别的会话 */
  keepGoing?: () => boolean;
  /** 已捕获的媒体数量，用来判断页面是否还在加载更早的消息 */
  getCapturedCount: () => number;
  /** 仅测试用：直接指定消息列表的滚动容器 */
  findScroller?: () => Scroller | undefined;
  wait?: (ms: number) => Promise<void>;
  interval?: number;
  /** 连续多少次没有新内容后认为已到达会话开头 */
  idleRounds?: number;
}

export type LoadHistoryResult = "done" | "aborted" | "no-scroller";

/**
 * 反复把页面推向更早的消息，触发页面自己加载历史，直到不再有新内容。
 * 优先用会话索引条，没有时退回滚动消息列表。结束后页面停在会话开头。
 */
export async function loadConversationHistory({
  signal,
  keepGoing = () => true,
  getCapturedCount,
  findScroller,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  interval = 600,
  idleRounds = 8,
}: LoadHistoryOptions): Promise<LoadHistoryResult> {
  const find = findScroller
    ? () => {
        const scroller = findScroller();
        return scroller && scrollerDriver(scroller);
      }
    : findDriver;
  let driver = find();
  if (!driver) return "no-scroller";

  let idle = 0;
  let lastSize: number | string = -1;
  let lastCount = getCapturedCount();
  while (idle < idleRounds && !signal?.aborted && keepGoing()) {
    // 页面重新渲染后原来的容器可能已被替换
    if (!driver.isConnected()) {
      driver = find();
      if (!driver) break;
    }
    driver.step(idle);
    await wait(interval);
    let count = getCapturedCount();
    // 这一步带出的内容还在陆续到达时多等一会，加载完再推进
    for (let previous = lastCount, i = 0; i < 5 && count !== previous && !signal?.aborted; i++) {
      previous = count;
      await wait(interval);
      count = getCapturedCount();
    }
    const size = driver.size();
    if (size !== lastSize || count !== lastCount) {
      idle = 0;
      lastSize = size;
      lastCount = count;
    } else {
      idle++;
    }
  }

  return signal?.aborted ? "aborted" : "done";
}
