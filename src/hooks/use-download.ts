import { useCallback, useRef, useState } from "react";
import pLimit from "p-limit";
import streamSaver from "streamsaver";
import saveAs from "file-saver";
import "../lib/zip-stream.js";
import type { DownloadImage, ZipWriter } from "@/types";

interface DownloadOptions {
  concurrency?: number;
  zipName?: string;
  onProgress?: (current: number, total: number) => void;
  onError?: (url: string, error: Error) => void;
  onSave?: (failedUrls: string[]) => void;
  onCancel?: () => void;
}

function createAbortError() {
  return new DOMException("下载已取消", "AbortError");
}

export function useDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
  });
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getFileNameFromUrl = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split("/").pop() || "image";
      return fileName;
    } catch {
      return `image_${Date.now()}`;
    }
  }, []);

  const getImageResponse = useCallback(
    async (url: string, signal?: AbortSignal): Promise<Response> => {
      try {
        const response = await fetch(url, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          signal,
        });

        if (!response.ok) {
          throw new Error(
            `下载失败: ${response.status} ${response.statusText}`,
          );
        }

        return response;
      } catch (error: any) {
        if (signal?.aborted) throw createAbortError();
        console.error(`下载图片 ${url} 失败:`, error);
        throw error;
      }
    },
    [],
  );

  const createZipStream = useCallback(
    async (
      downloadImageList: DownloadImage[],
      zipName: string,
      concurrency: number = 5,
      onProgress: (current: number, total: number) => void,
      onError: (url: string, error: Error) => void,
      signal?: AbortSignal,
    ): Promise<string[]> => {
      const total = downloadImageList.length;
      let completed = 0;
      const failedUrls: string[] = [];

      if (concurrency < 1 || concurrency > 32) {
        onError("", new Error("并发数量必须在1到32之间"));
        throw new Error("并发数量必须在1到32之间");
      }

      const fileStream = streamSaver.createWriteStream(`${zipName}.zip`);
      const writer = fileStream.getWriter();

      const zipReadableStream = window.ZIP({
        async start(zipWriter: ZipWriter) {
          const limit = pLimit(concurrency);

          const downloadPromises = downloadImageList.map((downloadImage) =>
            limit(async () => {
              if (signal?.aborted) return;
              const { url, folder } = downloadImage;

              try {
                const res = await getImageResponse(url, signal);
                const stream = () =>
                  res.body as ReadableStream<Uint8Array<ArrayBuffer>>;
                let fileName = downloadImage.filename || getFileNameFromUrl(url);

                zipWriter.enqueue({
                  name: (folder || "") + fileName,
                  lastModified: Date.now(),
                  directory: false,
                  stream: stream,
                });
              } catch (error: any) {
                if (signal?.aborted) return;
                console.error(`下载图片 ${url} 失败:`, error);
                failedUrls.push(url);
                onError(url, error as Error);
              } finally {
                if (!signal?.aborted) {
                  completed++;
                  onProgress(completed, total);
                }
              }
            }),
          );

          await Promise.all(downloadPromises);
          if (!signal?.aborted) zipWriter.close();
        },
      });

      const reader = zipReadableStream.getReader();
      let removeAbortListener = () => {};
      // 取消时即使某个文件卡住不返回数据，也能立刻跳出读取循环
      const aborted = new Promise<never>((_, reject) => {
        if (!signal) return;
        const onAbort = () => reject(createAbortError());
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      });
      aborted.catch(() => {});

      try {
        while (true) {
          const { done, value } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          await Promise.race([writer.write(value), aborted]);
        }

        await writer.close();
        return failedUrls;
      } catch (error) {
        if (!signal?.aborted) console.error("读取zip失败:", error);
        reader.cancel().catch(() => {});
        await writer.abort().catch(() => {});
        throw error;
      } finally {
        removeAbortListener();
      }
    },
    [getImageResponse, getFileNameFromUrl],
  );

  const download = useCallback(
    async (
      downloadImageList: DownloadImage[],
      options: DownloadOptions = {},
    ): Promise<void> => {
      const { onProgress = () => {}, onError = () => {} } = options;

      // 重置状态
      setError(null);
      setIsDownloading(true);
      setProgress({
        current: 0,
        total: downloadImageList.length,
        percentage: 0,
      });

      if (!downloadImageList.length) {
        setError(new Error("没有需要下载的图片"));
        setIsDownloading(false);
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const { signal } = abortController;

      try {
        // 合并进度回调
        const handleProgress = (current: number, total: number) => {
          const percentage =
            total > 0 ? Math.round((current / total) * 100) : 0;
          setProgress({ current, total, percentage });
          onProgress(current, total);
        };

        // 单张图片直接下载
        if (downloadImageList.length === 1) {
          const downloadImage = downloadImageList[0];
          const url = downloadImage.url;
          try {
            const response = await getImageResponse(url, signal);
            const blob = await response.blob();
            const fileName = downloadImage.filename || getFileNameFromUrl(url);
            saveAs(blob, fileName);
            handleProgress(1, 1);
            options.onSave?.([]);
          } catch (error: any) {
            if (!signal.aborted) onError(url, error as Error);
            throw error;
          }
        } else {
          // 多张图片打包下载
          const failedUrls = await createZipStream(
            downloadImageList,
            options.zipName || "豆包下载",
            options.concurrency || 5,
            handleProgress,
            onError,
            signal,
          );
          options.onSave?.(failedUrls);
        }
      } catch (error: any) {
        if (signal.aborted) {
          options.onCancel?.();
        } else {
          console.error("下载失败:", error);
          setError(error as Error);
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        setIsDownloading(false);
      }
    },
    [getImageResponse, createZipStream, getFileNameFromUrl],
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    download,
    cancel,
    isDownloading,
    progress,
    error,
  };
}
