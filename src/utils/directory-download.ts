import pLimit from "p-limit";
import type { DownloadImage } from "@/types";

// 目录句柄不能放进 Dexie（它会深拷贝对象），单独用一个原生 IndexedDB 库保存
const DB_NAME = "DouBaoDownloaderFS";
const STORE = "handles";
const KEY = "download_directory";
export const DIRECTORY_CHANGE_EVENT = "dd-download-directory-change";

type PermissionAware = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
};

/** 仅 Chromium 内核浏览器支持把文件直接写进用户选择的文件夹。 */
export function supportsDirectoryDownload() {
  return typeof window !== "undefined" && typeof (window as any).showDirectoryPicker === "function";
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.transaction!.oncomplete = () => db.close();
    };
  });
}

export async function getSavedDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  if (typeof indexedDB === "undefined" || !supportsDirectoryDownload()) return undefined;
  try {
    return (await withStore("readonly", (store) => store.get(KEY))) || undefined;
  } catch (error) {
    console.warn("豆包下载器: 读取下载文件夹失败", error);
    return undefined;
  }
}

async function setSavedDirectory(directory?: FileSystemDirectoryHandle) {
  await withStore("readwrite", (store) =>
    directory ? store.put(directory, KEY) : store.delete(KEY),
  );
  window.dispatchEvent(new Event(DIRECTORY_CHANGE_EVENT));
}

/** 弹出系统的文件夹选择框并记住结果，用户取消时返回 undefined。 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  let directory: FileSystemDirectoryHandle;
  try {
    directory = await (window as any).showDirectoryPicker({
      id: "doubao-downloader",
      mode: "readwrite",
    });
  } catch (error: any) {
    if (error?.name === "AbortError") return undefined;
    throw error;
  }
  await setSavedDirectory(directory);
  return directory;
}

export function clearDirectory() {
  return setSavedDirectory(undefined);
}

/** 浏览器重启后需要重新授权，必须在用户点击触发的调用里执行。 */
export async function ensureWritable(directory: FileSystemDirectoryHandle) {
  const handle = directory as PermissionAware;
  const descriptor = { mode: "readwrite" } as const;
  if ((await handle.queryPermission?.(descriptor)) === "granted") return true;
  return (await handle.requestPermission?.(descriptor)) === "granted";
}

interface SaveOptions {
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
  onError?: (url: string, error: Error) => void;
  fetchFile?: (item: DownloadImage, signal?: AbortSignal) => Promise<Response>;
  /** 正在后台重试的文件数变化时调用 */
  onRetrying?: (count: number) => void;
  /** 首次请求的时限，超过后转入后台重试 */
  timeout?: number;
  /** 后台重试时每次请求的时限 */
  retryTimeout?: number;
  maxRetries?: number;
  /** 重试前的等待毫秒数，按次数递增 */
  retryDelay?: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_END = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

const startsWith = (bytes: ArrayLike<number>, expected: number[]) =>
  bytes.length >= expected.length && expected.every((value, index) => bytes[index] === value);

/**
 * 图片服务器首次生成某张图时传得很慢，偶尔传到一半就停住或结束连接，
 * 得到的是只有上半截的残缺文件。这里边收边记录，用来在收完后判断是否完整。
 */
export function createIntegrityCheck(expectedLength?: number) {
  let received = 0;
  let head: number[] = [];
  let tail: number[] = [];
  return {
    update(chunk: Uint8Array) {
      received += chunk.length;
      if (head.length < PNG_SIGNATURE.length) {
        head = head.concat(Array.from(chunk.subarray(0, PNG_SIGNATURE.length - head.length)));
      }
      tail = tail.concat(Array.from(chunk.subarray(-PNG_END.length))).slice(-PNG_END.length);
    },
    isComplete() {
      if (received === 0) return false;
      if (expectedLength && received !== expectedLength) return false;
      // PNG 必须以 IEND 块结尾
      return !startsWith(head, PNG_SIGNATURE) || startsWith(tail, PNG_END);
    },
  };
}

/**
 * 失败后重试。请求被服务器明确拒绝（4xx）或用户取消时不重试。
 * 间隔留得比较长，给服务器把图生成完的时间。
 */
export async function withRetry<T>(
  run: () => Promise<T>,
  { signal, attempts = 3, delay = 2000 }: { signal?: AbortSignal; attempts?: number; delay?: number } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error: any) {
      const rejected = error?.status >= 400 && error?.status < 500;
      if (attempt >= attempts || rejected || signal?.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
}

export interface SaveResult {
  failedUrls: string[];
  /** 文件夹里已经存在而跳过的数量 */
  skipped: number;
}

// 浏览器拒绝某个名称时（Name is not allowed）换成只含字母、数字的保守写法再试一次
function conservativeName(name: string) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^[._]+|[._]+$/g, "") || "未命名";
}

async function withAllowedName<T>(name: string, open: (name: string) => Promise<T>) {
  try {
    return await open(name);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return open(conservativeName(name));
  }
}

async function resolveFolder(directory: FileSystemDirectoryHandle, folder?: string) {
  let target = directory;
  for (const part of (folder || "").split("/").filter(Boolean)) {
    const parent = target;
    target = await withAllowedName(part, (name) =>
      parent.getDirectoryHandle(name, { create: true }),
    );
  }
  return target;
}

async function exists(directory: FileSystemDirectoryHandle, name: string) {
  try {
    const file = await (await directory.getFileHandle(name)).getFile();
    return file.size > 0;
  } catch {
    return false;
  }
}

/** 用户取消，或这一次尝试超过时限时中止等待。 */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("已中止", "AbortError"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * 把文件逐个写进文件夹。每个文件写完才释放并发名额，
 * 已存在的文件直接跳过，所以中断或部分失败后重新下载即可续传。
 *
 * 一次请求超过 timeout 仍未完成（或中途出错）时不在原地等：让出并发名额，
 * 转到后台队列重试，最多 maxRetries 次，主队列继续下载其它文件。
 */
export async function saveToDirectory(
  directory: FileSystemDirectoryHandle,
  items: DownloadImage[],
  {
    concurrency = 5,
    signal,
    onProgress = () => {},
    onError = () => {},
    onRetrying = () => {},
    fetchFile = (item, fetchSignal) => fetch(item.url, { cache: "no-store", signal: fetchSignal }),
    timeout = 30000,
    retryTimeout = 60000,
    maxRetries = 5,
    retryDelay = 2000,
  }: SaveOptions = {},
): Promise<SaveResult> {
  const limit = pLimit(concurrency);
  const backgroundLimit = pLimit(Math.min(concurrency, 3));
  const background: Promise<void>[] = [];
  const failedUrls: string[] = [];
  let skipped = 0;
  let completed = 0;
  let retrying = 0;

  const finish = (item: DownloadImage, error?: unknown) => {
    if (signal?.aborted) return;
    if (error) {
      console.error(`下载 ${item.url} 失败:`, error);
      failedUrls.push(item.url);
      onError(item.url, error as Error);
    }
    onProgress(++completed, items.length);
  };

  const writeFile = async (
    target: FileSystemDirectoryHandle,
    filename: string,
    item: DownloadImage,
    attemptSignal: AbortSignal,
  ) => {
    const response = await abortable(fetchFile(item, attemptSignal), attemptSignal);
    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`下载失败: ${response.status} ${response.statusText}`), {
        status: response.status,
      });
    }
    // 压缩传输时 content-length 是压缩后的长度，不能拿来比
    const length = response.headers?.get("content-encoding")
      ? undefined
      : Number(response.headers?.get("content-length")) || undefined;
    const integrity = createIntegrityCheck(length);
    const reader = response.body.getReader();
    const writable = await (await target.getFileHandle(filename, { create: true })).createWritable();
    try {
      while (true) {
        const { done, value } = await abortable(reader.read(), attemptSignal);
        if (done) break;
        integrity.update(value);
        await writable.write(value);
      }
      if (!integrity.isComplete()) throw new Error("文件不完整，服务器提前结束了传输");
      await writable.close();
    } catch (error) {
      // 写到一半的文件不能留下，否则下次会被当成已下载而跳过
      Promise.resolve(reader.cancel?.()).catch(() => {});
      await writable.abort().catch(() => {});
      await target.removeEntry(filename).catch(() => {});
      throw error;
    }
  };

  /** 在时限内完成一次下载，超时会中止请求并抛出带说明的错误。 */
  const attempt = async (
    target: FileSystemDirectoryHandle,
    filename: string,
    item: DownloadImage,
    limitMs: number,
  ) => {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limitMs);
    try {
      await writeFile(target, filename, item, controller.signal);
    } catch (error) {
      if (timedOut) throw new Error(`请求超过 ${Math.round(limitMs / 1000)} 秒未完成`);
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };

  // 服务器明确拒绝（如链接过期的 403）时重试没有意义
  const isRejected = (error: any) => error?.status >= 400 && error?.status < 500;

  const retryInBackground = async (
    target: FileSystemDirectoryHandle,
    filename: string,
    item: DownloadImage,
    firstError: unknown,
  ) => {
    let lastError = firstError;
    for (let retry = 1; retry <= maxRetries && !signal?.aborted; retry++) {
      await abortable(
        new Promise((resolve) => setTimeout(resolve, retryDelay * retry)),
        signal,
      ).catch(() => {});
      if (signal?.aborted) break;
      try {
        await attempt(target, filename, item, retryTimeout);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (isRejected(error)) break;
      }
    }
    onRetrying(--retrying);
    finish(
      item,
      lastError && new Error(`${(lastError as Error).message}（已重试 ${maxRetries} 次）`),
    );
  };

  await Promise.all(
    items.map((item) =>
      limit(async () => {
        if (signal?.aborted) return;
        let target: FileSystemDirectoryHandle;
        let filename: string;
        try {
          target = await resolveFolder(directory, item.folder);
          // 先确定浏览器接受的文件名，后面的判断、写入、清理都用同一个
          filename = await withAllowedName(item.filename, async (name) => {
            await target.getFileHandle(name).catch((error) => {
              if (error instanceof TypeError) throw error;
            });
            return name;
          });
          if (await exists(target, filename)) {
            skipped++;
            return finish(item);
          }
          await attempt(target, filename, item, timeout);
          finish(item);
        } catch (error) {
          if (signal?.aborted) return;
          if (isRejected(error) || !target! || !filename!) return finish(item, error);
          onRetrying(++retrying);
          const retryTarget = target;
          const retryName = filename;
          background.push(
            backgroundLimit(() => retryInBackground(retryTarget, retryName, item, error)),
          );
        }
      }),
    ),
  );
  await Promise.all(background);

  if (signal?.aborted) throw new DOMException("下载已取消", "AbortError");
  return { failedUrls, skipped };
}
