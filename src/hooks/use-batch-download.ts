import { useCallback, useRef, useState } from "react";
import { Toast } from "@douyinfe/semi-ui-19";
import type { ConvMessage } from "@/types";
import { getCurrentConvId } from "@/utils/conv-filter";
import { findNextConvId, openConv } from "@/utils/conv-navigation";
import { ensureWritable, getSavedDirectory } from "@/utils/directory-download";
import type { LoadHistoryResult } from "@/utils/load-history";

export type BatchPhase = "loading" | "downloading" | "switching";

export interface BatchState {
  /** 第几个会话，从 1 开始 */
  index: number;
  convId: string;
  phase: BatchPhase;
  /** 已处理完的会话数 */
  finished: number;
  /** 已交给下载的文件数 */
  files: number;
}

interface UseBatchDownloadProps {
  /** 加载该会话更早的消息，加载完成后返回 */
  loadHistory: (convId: string) => Promise<LoadHistoryResult | undefined>;
  stopHistory: () => void;
  /** 该会话里按当前筛选条件要下载的内容，等同于面板上的「全部下载」 */
  collect: (convId: string) => ConvMessage[];
  /** 下载并等待完成 */
  download: (convs: ConvMessage[]) => Promise<void>;
  isDownloadBusy: () => boolean;
  cancelDownload: () => void;
  onSelectConv: (convId: string) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/**
 * 从当前会话开始，依次：加载历史 → 全部下载 → 点开侧边栏里的下一个会话，直到没有下一个或被停止。
 */
export function useBatchDownload(props: UseBatchDownloadProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const [state, setState] = useState<BatchState>();

  const stop = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.abort();
    propsRef.current.stopHistory();
    propsRef.current.cancelDownload();
  }, []);

  const start = useCallback(async () => {
    if (controllerRef.current) return;
    let convId = getCurrentConvId();
    if (!convId) {
      Toast.warning("请先打开一个对话，批量下载会从这个对话开始");
      return;
    }
    // 下载到文件夹需要的授权必须紧跟这次点击，等轮到下载时已经不算用户操作了
    const directory = await getSavedDirectory();
    if (directory && !(await ensureWritable(directory).catch(() => false))) {
      Toast.error(`没有获得文件夹「${directory.name}」的写入权限，已取消批量下载`);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    const visited = new Set<string>();
    let finished = 0;
    let files = 0;
    let stopReason = "";
    const update = (phase: BatchPhase) =>
      setState({ index: visited.size, convId: convId!, phase, finished, files });

    try {
      while (convId && !signal.aborted) {
        visited.add(convId);
        const p = propsRef.current;
        p.onSelectConv(convId);

        update("loading");
        await p.loadHistory(convId);
        if (signal.aborted) break;

        update("downloading");
        // 用户手动发起的下载还没结束时先等它
        while (propsRef.current.isDownloadBusy() && !signal.aborted) await sleep(500, signal);
        const convs = propsRef.current.collect(convId);
        if (convs.length > 0) {
          files += convs.length;
          update("downloading");
          await propsRef.current.download(convs);
        }
        if (signal.aborted) break;
        finished++;

        update("switching");
        const next = await findNextConvId(convId, visited, { signal });
        if (!next) {
          stopReason = "已经是侧边栏里的最后一个对话";
          break;
        }
        if (!(await openConv(next, { signal }))) {
          if (!signal.aborted) stopReason = `没能打开对话 ${next}`;
          break;
        }
        convId = next;
        // 给页面一点时间拉取新会话的消息
        await sleep(1500, signal);
      }
    } catch (error) {
      console.error("批量下载出错:", error);
      stopReason = "出错了，请在控制台查看详细错误";
    } finally {
      controllerRef.current = undefined;
      setState(undefined);
      const summary = `批量下载${signal.aborted ? "已停止" : "结束"}：处理了 ${finished} 个对话，共 ${files} 个文件`;
      if (stopReason && !signal.aborted) {
        Toast.info({ content: `${summary}。${stopReason}`, duration: 6 });
      } else {
        Toast.info(summary);
      }
    }
  }, []);

  return { state, isRunning: Boolean(state), start, stop };
}
