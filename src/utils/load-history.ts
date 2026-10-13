const OWN_UI_SELECTOR = ".semi-portal, .semi-modal-wrap, #dd-modal-popup-container";
const INDEX_ENTRY_SELECTOR = "button[data-index-entry-key]";

type Scroller = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight" | "isConnected">;

/** 一种把页面推向更早消息的方式。 */
export interface HistoryDriver {
  isConnected: () => boolean;
  /** 向更早的方向推进一步，idle 为已经连续多少轮没有新内容 */
  step: (idle: number) => void;
  /** 页面已加载内容的量，变化说明还在加载 */
  size: () => number;
  /** 回到最新消息 */
  finish: () => void;
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

function scrollerDriver(scroller: Scroller): HistoryDriver {
  return {
    isConnected: () => scroller.isConnected,
    step: () => {
      scroller.scrollTop = isReversed(scroller) ? scroller.clientHeight - scroller.scrollHeight : 0;
    },
    size: () => scroller.scrollHeight,
    finish: () => {
      scroller.scrollTop = isReversed(scroller) ? 0 : scroller.scrollHeight;
    },
  };
}

/**
 * 消息列表旁边的会话索引条（每条提问一个小横条）。
 * 滚动它加载历史比滚动消息列表快得多，页面也不用渲染沿途的所有图片。
 */
export function findIndexRailDriver(): HistoryDriver | undefined {
  let el = document.querySelector<HTMLElement>(INDEX_ENTRY_SELECTOR)?.parentElement;
  while (el && !isScrollable(el)) el = el.parentElement;
  if (!el) return undefined;

  const rail = el;
  const entries = () => rail.querySelectorAll<HTMLElement>(INDEX_ENTRY_SELECTOR);
  let jumped = false;
  return {
    isConnected: () => rail.isConnected,
    step: (idle) => {
      rail.scrollTop = 0;
      // 只滚动索引条没有带出新内容时，跳到最早的一条，让页面从那里继续往前加载
      if (idle >= 2) {
        entries()[0]?.click();
        jumped = true;
      }
    },
    size: () => entries().length,
    finish: () => {
      rail.scrollTop = rail.scrollHeight;
      if (jumped) {
        const all = entries();
        all[all.length - 1]?.click();
      }
    },
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
 * 优先用会话索引条，没有时退回滚动消息列表。结束后回到最新消息。
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
  let lastSize = -1;
  let lastCount = getCapturedCount();
  while (idle < idleRounds && !signal?.aborted && keepGoing()) {
    // 页面重新渲染后原来的容器可能已被替换
    if (!driver.isConnected()) {
      driver = find();
      if (!driver) break;
    }
    driver.step(idle);
    await wait(interval);
    const size = driver.size();
    const count = getCapturedCount();
    if (size !== lastSize || count !== lastCount) {
      idle = 0;
      lastSize = size;
      lastCount = count;
    } else {
      idle++;
    }
  }

  if (driver?.isConnected()) driver.finish();
  return signal?.aborted ? "aborted" : "done";
}
