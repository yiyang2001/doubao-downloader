import { useCallback, useRef, useState } from "react";
import { Toast } from "@douyinfe/semi-ui-19";
import type { ConvMessage } from "@/types";

export interface DownloadJobInfo {
  id: number;
  /** 对话ID，或「N 个对话」 */
  label: string;
  /** 这个任务包含的文件数 */
  count: number;
}

type Job = DownloadJobInfo & { convs: ConvMessage[] };

/**
 * 保证同一时间只有一个下载任务在跑。
 * 开启排队时，下载中发起的新任务进入队列依次执行；未开启时提示请勿重复下载。
 */
export function useDownloadQueue(
  run: (convMessages: ConvMessage[]) => Promise<void>,
  queueEnabled: boolean,
) {
  // 队列里的任务用轮到它时的最新设置
  const runRef = useRef(run);
  runRef.current = run;
  const queueEnabledRef = useRef(queueEnabled);
  queueEnabledRef.current = queueEnabled;
  // 从点击下载到任务真正结束都算忙
  const busyRef = useRef(false);
  const queueRef = useRef<Job[]>([]);
  const nextIdRef = useRef(1);
  const [queue, setQueue] = useState<DownloadJobInfo[]>([]);
  const [current, setCurrent] = useState<DownloadJobInfo>();

  const sync = useCallback(() => {
    setQueue(queueRef.current.map(({ id, label, count }) => ({ id, label, count })));
  }, []);

  const start = useCallback(async (convMessages: ConvMessage[]) => {
    if (convMessages.length === 0) {
      Toast.warning("请选择要下载的内容");
      return;
    }
    const convIds = new Set(
      convMessages.map((conv) => (conv.source === "aispace" ? "我的创作" : conv.conversation_id)),
    );
    const job: Job = {
      id: nextIdRef.current++,
      label: convIds.size === 1 ? [...convIds][0] : `${convIds.size} 个对话`,
      count: convMessages.length,
      convs: convMessages,
    };
    if (busyRef.current) {
      if (!queueEnabledRef.current) {
        Toast.warning("正在下载中，请勿重复下载");
        return;
      }
      queueRef.current.push(job);
      sync();
      Toast.info(`已加入下载队列，排在第 ${queueRef.current.length} 位`);
      return;
    }
    busyRef.current = true;
    setCurrent(job);
    try {
      await runRef.current(convMessages);
    } catch (error) {
      console.error("下载任务出错:", error);
      Toast.error("下载任务出错，请在控制台查看详细错误");
    } finally {
      busyRef.current = false;
      setCurrent(undefined);
      const next = queueRef.current.shift();
      sync();
      if (next) start(next.convs);
    }
  }, []);

  const clear = useCallback(() => {
    queueRef.current = [];
    sync();
  }, []);

  const remove = useCallback((id: number) => {
    queueRef.current = queueRef.current.filter((job) => job.id !== id);
    sync();
  }, []);

  return { start, current, queue, clear, remove };
}
