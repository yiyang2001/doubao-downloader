import { describe, expect, it, vi } from "vitest";
import type { DownloadImage } from "@/types";
import { saveToDirectory } from "./directory-download";

// 内存里的假文件夹，只实现 saveToDirectory 用到的接口
function fakeDirectory() {
  const files = new Map<string, Uint8Array[]>();
  const dirs = new Map<string, ReturnType<typeof fakeDirectory>>();
  const notFound = () => Object.assign(new Error("not found"), { name: "NotFoundError" });
  const handle = {
    files,
    dirs,
    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
      if (!dirs.has(name)) {
        if (!options?.create) throw notFound();
        dirs.set(name, fakeDirectory());
      }
      return dirs.get(name)!.handle;
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!options?.create) throw notFound();
        files.set(name, []);
      }
      return {
        getFile: async () => ({ size: files.get(name)!.reduce((sum, chunk) => sum + chunk.length, 0) }),
        createWritable: async () => {
          const chunks: Uint8Array[] = [];
          return {
            write: async (chunk: Uint8Array) => void chunks.push(chunk),
            close: async () => void files.set(name, chunks),
            abort: async () => {},
          };
        },
      };
    },
    async removeEntry(name: string) {
      files.delete(name);
    },
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, files, dirs };
}

const item = (name: string, folder = ""): DownloadImage => ({
  conversation_id: "conversation",
  message_id: name,
  key: name,
  url: `https://example.test/${name}`,
  filename: name,
  folder,
});

const response = (chunks: number[][], ok = true) =>
  ({
    ok,
    status: ok ? 200 : 403,
    statusText: ok ? "OK" : "Forbidden",
    body: {
      getReader: () => {
        let index = 0;
        return {
          read: async () =>
            index < chunks.length
              ? { done: false, value: new Uint8Array(chunks[index++]) }
              : { done: true, value: undefined },
        };
      },
    },
  }) as unknown as Response;

describe("saveToDirectory", () => {
  it("writes each file, creating sub-folders as needed", async () => {
    const root = fakeDirectory();
    const onProgress = vi.fn();
    const result = await saveToDirectory(root.handle, [item("a.png"), item("b.png", "chat/")], {
      fetchFile: async () => response([[1, 2], [3]]),
      onProgress,
    });

    expect(result).toEqual({ failedUrls: [], skipped: 0 });
    expect(root.files.get("a.png")).toHaveLength(2);
    expect(root.dirs.get("chat")!.files.has("b.png")).toBe(true);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it("skips files that already exist so a download can be resumed", async () => {
    const root = fakeDirectory();
    root.files.set("a.png", [new Uint8Array([1])]);
    const fetchFile = vi.fn(async () => response([[1]]));
    const result = await saveToDirectory(root.handle, [item("a.png"), item("b.png")], { fetchFile });

    expect(result).toEqual({ failedUrls: [], skipped: 1 });
    expect(fetchFile).toHaveBeenCalledTimes(1);
  });

  it("reports failures without stopping the rest and leaves no partial file", async () => {
    const root = fakeDirectory();
    const onError = vi.fn();
    const result = await saveToDirectory(root.handle, [item("a.png"), item("b.png")], {
      fetchFile: async (url) => {
        if (url.endsWith("b.png")) return response([[1]]);
        return {
          ...response([]),
          body: { getReader: () => ({ read: async () => { throw new Error("network"); } }) },
        } as unknown as Response;
      },
      onError,
    });

    expect(result.failedUrls).toEqual(["https://example.test/a.png"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(root.files.has("a.png")).toBe(false);
    expect(root.files.has("b.png")).toBe(true);
  });

  it("never runs more downloads at once than the concurrency limit", async () => {
    const root = fakeDirectory();
    let active = 0;
    let peak = 0;
    await saveToDirectory(root.handle, Array.from({ length: 12 }, (_, i) => item(`${i}.png`)), {
      concurrency: 3,
      fetchFile: async () => {
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return response([[1]]);
      },
    });
    expect(peak).toBe(3);
  });

  it("falls back to a conservative name when the browser rejects one", async () => {
    const root = fakeDirectory();
    const strict = root.handle as any;
    const getDirectoryHandle = strict.getDirectoryHandle;
    strict.getDirectoryHandle = async (name: string, options: any) => {
      if (name.includes("!")) throw new TypeError("Name is not allowed.");
      return getDirectoryHandle(name, options);
    };
    const result = await saveToDirectory(root.handle, [item("a.png", "hello! world/")], {
      fetchFile: async () => response([[1]]),
    });

    expect(result.failedUrls).toEqual([]);
    expect(root.dirs.get("hello_world")!.files.has("a.png")).toBe(true);
  });

  it("rejects when cancelled", async () => {
    const root = fakeDirectory();
    const controller = new AbortController();
    controller.abort();
    await expect(
      saveToDirectory(root.handle, [item("a.png")], { signal: controller.signal, fetchFile: async () => response([[1]]) }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(root.files.size).toBe(0);
  });
});
