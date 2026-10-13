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
  fetchFile?: (url: string, signal?: AbortSignal) => Promise<Response>;
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

/**
 * 把文件逐个写进文件夹。每个文件写完才释放并发名额，
 * 已存在的文件直接跳过，所以中断或部分失败后重新下载即可续传。
 */
export async function saveToDirectory(
  directory: FileSystemDirectoryHandle,
  items: DownloadImage[],
  {
    concurrency = 5,
    signal,
    onProgress = () => {},
    onError = () => {},
    fetchFile = (url, fetchSignal) => fetch(url, { cache: "no-store", signal: fetchSignal }),
  }: SaveOptions = {},
): Promise<SaveResult> {
  const limit = pLimit(concurrency);
  const failedUrls: string[] = [];
  let skipped = 0;
  let completed = 0;

  const saveOne = async (item: DownloadImage) => {
    const target = await resolveFolder(directory, item.folder);
    // 先确定浏览器接受的文件名，后面的判断、写入、清理都用同一个
    const filename = await withAllowedName(item.filename, async (name) => {
      await target.getFileHandle(name).catch((error) => {
        if (error instanceof TypeError) throw error;
      });
      return name;
    });
    if (await exists(target, filename)) {
      skipped++;
      return;
    }
    const response = await fetchFile(item.url, signal);
    if (!response.ok || !response.body) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }
    const writable = await (await target.getFileHandle(filename, { create: true })).createWritable();
    try {
      const reader = response.body.getReader();
      while (true) {
        if (signal?.aborted) throw new DOMException("下载已取消", "AbortError");
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
      await writable.close();
    } catch (error) {
      // 写到一半的文件不能留下，否则下次会被当成已下载而跳过
      await writable.abort().catch(() => {});
      await target.removeEntry(filename).catch(() => {});
      throw error;
    }
  };

  await Promise.all(
    items.map((item) =>
      limit(async () => {
        if (signal?.aborted) return;
        try {
          await saveOne(item);
        } catch (error) {
          if (signal?.aborted) return;
          console.error(`下载 ${item.url} 失败:`, error);
          failedUrls.push(item.url);
          onError(item.url, error as Error);
        } finally {
          if (!signal?.aborted) onProgress(++completed, items.length);
        }
      }),
    ),
  );

  if (signal?.aborted) throw new DOMException("下载已取消", "AbortError");
  return { failedUrls, skipped };
}
