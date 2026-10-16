import { getCurrentConvId } from "@/utils/conv-filter";

const OWN_UI_SELECTOR = ".semi-portal, .semi-modal-wrap, #doubao-downloader";
const CONV_ID_IN_HREF = /\/chat\/(\d+)/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 侧边栏里的会话链接，按页面上从上到下的顺序，每个会话一条。 */
export function listSidebarConvLinks() {
  const links = new Map<string, HTMLAnchorElement>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/chat/"]')) {
    if (link.closest(OWN_UI_SELECTOR)) continue;
    const id = link.getAttribute("href")?.match(CONV_ID_IN_HREF)?.[1];
    if (id && !links.has(id)) links.set(id, link);
  }
  return links;
}

function scrollableAncestor(el: Element | null) {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return undefined;
}

/**
 * 侧边栏里排在 currentId 下面、还没处理过的下一个会话。
 * 侧边栏是滚动加载的，找不到时往下滚几次再找。
 */
export async function findNextConvId(
  currentId: string,
  visited: Set<string>,
  { signal, wait = sleep }: { signal?: AbortSignal; wait?: (ms: number) => Promise<void> } = {},
) {
  for (let attempt = 0; attempt < 4 && !signal?.aborted; attempt++) {
    const ids = [...listSidebarConvLinks().keys()];
    const after = ids.slice(ids.indexOf(currentId) + 1);
    const next = after.find((id) => !visited.has(id));
    if (next) return next;
    const lastLink = [...listSidebarConvLinks().values()].pop();
    const sidebar = scrollableAncestor(lastLink ?? null);
    if (!sidebar) break;
    sidebar.scrollTop = sidebar.scrollHeight;
    await wait(1500);
  }
  return undefined;
}

/** 像用户一样点击侧边栏里的会话，并等到地址切换过去。 */
export async function openConv(
  id: string,
  { signal, timeout = 15000, wait = sleep }: { signal?: AbortSignal; timeout?: number; wait?: (ms: number) => Promise<void> } = {},
) {
  const link = listSidebarConvLinks().get(id);
  if (!link) return false;
  link.scrollIntoView?.({ block: "nearest" });
  link.click();
  for (let waited = 0; waited < timeout && !signal?.aborted; waited += 300) {
    if (getCurrentConvId() === id) return true;
    await wait(300);
  }
  return getCurrentConvId() === id;
}
