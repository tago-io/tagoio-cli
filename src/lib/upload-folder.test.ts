import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const readFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();
const readdirSyncMock = vi.fn();
const statSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
  readdirSync: (...args: unknown[]) => readdirSyncMock(...args),
  statSync: (...args: unknown[]) => statSyncMock(...args),
}));

import { collectFiles, uploadFolder } from "./upload-folder.js";

/** Builds a fake fs tree: map of dir -> entries, and a set of file paths. */
function mockTree(tree: Record<string, string[]>, files: Set<string>) {
  existsSyncMock.mockImplementation((p: string) => p in tree || files.has(p));
  readdirSyncMock.mockImplementation((p: string) => tree[p] ?? []);
  statSyncMock.mockImplementation((p: string) => ({
    isDirectory: () => p in tree,
    isFile: () => files.has(p),
  }));
}

describe("collectFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("recurses and roots relative paths at the base dir", () => {
    mockTree(
      {
        "/dist": ["index.html", "sub"],
        "/dist/sub": ["app.js"],
      },
      new Set(["/dist/index.html", "/dist/sub/app.js"]),
    );

    const result = collectFiles("/dist", "/dist");

    expect(result).toEqual([
      { filePath: "/dist/index.html", relativePath: "index.html" },
      { filePath: "/dist/sub/app.js", relativePath: "sub/app.js" },
    ]);
  });

  test("returns empty when the directory does not exist", () => {
    existsSyncMock.mockReturnValue(false);
    expect(collectFiles("/nope", "/nope")).toEqual([]);
  });
});

describe("uploadFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileSyncMock.mockReturnValue(Buffer.from("hello"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uploads a single file to the full remote path (relativePath empty)", async () => {
    mockTree({}, new Set(["/dist/index.html"]));
    const uploadBase64 = vi.fn().mockResolvedValue("ok");
    const resources = { files: { uploadBase64 } } as never;

    const result = await uploadFolder({
      resources,
      localPath: "/dist/index.html",
      remotePath: "files-test/private-index.html",
      public: false,
    });

    expect(result).toEqual({ created: 1, failed: 0 });
    expect(uploadBase64).toHaveBeenCalledTimes(1);
    expect((uploadBase64.mock.calls[0][0] as { filename: string }[])[0].filename).toBe("/files-test/private-index.html");
  });

  test("returns zero counts when localPath does not exist", async () => {
    existsSyncMock.mockReturnValue(false);
    const uploadBase64 = vi.fn();
    const resources = { files: { uploadBase64 } } as never;

    const result = await uploadFolder({ resources, localPath: "/missing", remotePath: "w", public: true });

    expect(result).toEqual({ created: 0, failed: 0 });
    expect(uploadBase64).not.toHaveBeenCalled();
  });

  test("uploads every file under the remote prefix and counts successes", async () => {
    mockTree(
      {
        "/dist": ["index.html", "sub"],
        "/dist/sub": ["app.js"],
      },
      new Set(["/dist/index.html", "/dist/sub/app.js"]),
    );
    const uploadBase64 = vi.fn().mockResolvedValue("ok");
    const resources = { files: { uploadBase64 } } as never;

    const result = await uploadFolder({
      resources,
      localPath: "/dist",
      remotePath: "custom-widgets/line-chart",
      public: true,
    });

    expect(result).toEqual({ created: 2, failed: 0 });
    expect(uploadBase64).toHaveBeenCalledTimes(2);
    const filenames = uploadBase64.mock.calls.map((c) => (c[0] as { filename: string }[])[0].filename).sort();
    expect(filenames).toEqual(["/custom-widgets/line-chart/index.html", "/custom-widgets/line-chart/sub/app.js"]);
  });

  test("flows the public flag through to uploadBase64", async () => {
    mockTree({ "/dist": ["index.html"] }, new Set(["/dist/index.html"]));
    const uploadBase64 = vi.fn().mockResolvedValue("ok");
    const resources = { files: { uploadBase64 } } as never;

    await uploadFolder({ resources, localPath: "/dist", remotePath: "w", public: false });

    expect((uploadBase64.mock.calls[0][0] as { public: boolean }[])[0].public).toBe(false);
  });

  test("invokes onProgress after each file with the running counts", async () => {
    mockTree({ "/dist": ["a.txt", "b.txt"] }, new Set(["/dist/a.txt", "/dist/b.txt"]));
    const uploadBase64 = vi.fn().mockResolvedValue("ok");
    const resources = { files: { uploadBase64 } } as never;
    const onProgress = vi.fn();

    await uploadFolder({ resources, localPath: "/dist", remotePath: "w", public: true, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ created: 2, failed: 0 });
  });

  test("returns zero counts when the folder has no files", async () => {
    existsSyncMock.mockReturnValue(false);
    const uploadBase64 = vi.fn();
    const resources = { files: { uploadBase64 } } as never;

    const result = await uploadFolder({ resources, localPath: "/empty", remotePath: "w", public: true });

    expect(result).toEqual({ created: 0, failed: 0 });
    expect(uploadBase64).not.toHaveBeenCalled();
  });

  test("counts a per-file failure without aborting the run", async () => {
    mockTree({ "/dist": ["a.txt", "b.txt"] }, new Set(["/dist/a.txt", "/dist/b.txt"]));
    const uploadBase64 = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    const resources = { files: { uploadBase64 } } as never;

    const result = await uploadFolder({ resources, localPath: "/dist", remotePath: "w", public: true });

    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
  });
});
