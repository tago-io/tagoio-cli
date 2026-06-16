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

/** uploadFile(content, filename, options) — pull args by name for assertions. */
function uploadArgs(mock: ReturnType<typeof vi.fn>, call = 0) {
  const [content, filename, options] = mock.mock.calls[call];
  return { content, filename, options: options as { isPublic: boolean; contentType: string } };
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
    const uploadFile = vi.fn().mockResolvedValue({ file: "ok" });
    const resources = { files: { uploadFile } } as never;

    const result = await uploadFolder({
      resources,
      localPath: "/dist/index.html",
      remotePath: "files-test/private-index.html",
      public: false,
    });

    expect(result).toEqual({ created: 1, failed: 0 });
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadArgs(uploadFile).filename).toBe("/files-test/private-index.html");
  });

  test("returns zero counts when localPath does not exist", async () => {
    existsSyncMock.mockReturnValue(false);
    const uploadFile = vi.fn();
    const resources = { files: { uploadFile } } as never;

    const result = await uploadFolder({ resources, localPath: "/missing", remotePath: "w", public: true });

    expect(result).toEqual({ created: 0, failed: 0 });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  test("uploads every file under the remote prefix and counts successes", async () => {
    mockTree(
      {
        "/dist": ["index.html", "sub"],
        "/dist/sub": ["app.js"],
      },
      new Set(["/dist/index.html", "/dist/sub/app.js"]),
    );
    const uploadFile = vi.fn().mockResolvedValue({ file: "ok" });
    const resources = { files: { uploadFile } } as never;

    const result = await uploadFolder({
      resources,
      localPath: "/dist",
      remotePath: "custom-widgets/line-chart",
      public: true,
    });

    expect(result).toEqual({ created: 2, failed: 0 });
    expect(uploadFile).toHaveBeenCalledTimes(2);
    const filenames = uploadFile.mock.calls.map((c) => c[1]).sort();
    expect(filenames).toEqual(["/custom-widgets/line-chart/index.html", "/custom-widgets/line-chart/sub/app.js"]);
  });

  test("sets the Content-Type by file extension (so browsers render, not download)", async () => {
    mockTree(
      {
        "/dist": ["index.html", "index-abc.js", "index-abc.css"],
      },
      new Set(["/dist/index.html", "/dist/index-abc.js", "/dist/index-abc.css"]),
    );
    const uploadFile = vi.fn().mockResolvedValue({ file: "ok" });
    const resources = { files: { uploadFile } } as never;

    await uploadFolder({ resources, localPath: "/dist", remotePath: "w", public: true });

    const byName = new Map(uploadFile.mock.calls.map((c) => [c[1] as string, c[2] as { contentType: string }]));
    expect(byName.get("/w/index.html")?.contentType).toBe("text/html");
    expect(byName.get("/w/index-abc.js")?.contentType).toBe("text/javascript");
    expect(byName.get("/w/index-abc.css")?.contentType).toBe("text/css");
  });

  test("defaults unknown extensions to application/octet-stream", async () => {
    mockTree({}, new Set(["/dist/data.bin"]));
    const uploadFile = vi.fn().mockResolvedValue({ file: "ok" });
    const resources = { files: { uploadFile } } as never;

    await uploadFolder({ resources, localPath: "/dist/data.bin", remotePath: "w/data.bin", public: true });

    expect(uploadArgs(uploadFile).options.contentType).toBe("application/octet-stream");
  });

  test("flows the public flag through to uploadFile as isPublic", async () => {
    mockTree({ "/dist": ["index.html"] }, new Set(["/dist/index.html"]));
    const uploadFile = vi.fn().mockResolvedValue({ file: "ok" });
    const resources = { files: { uploadFile } } as never;

    await uploadFolder({ resources, localPath: "/dist", remotePath: "w", public: false });

    expect(uploadArgs(uploadFile).options.isPublic).toBe(false);
  });

  test("invokes onProgress after each file with the running counts", async () => {
    mockTree({ "/dist": ["a.txt", "b.txt"] }, new Set(["/dist/a.txt", "/dist/b.txt"]));
    const uploadFile = vi.fn().mockResolvedValue({ file: "ok" });
    const resources = { files: { uploadFile } } as never;
    const onProgress = vi.fn();

    await uploadFolder({ resources, localPath: "/dist", remotePath: "w", public: true, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ created: 2, failed: 0 });
  });

  test("returns zero counts when the folder has no files", async () => {
    existsSyncMock.mockReturnValue(false);
    const uploadFile = vi.fn();
    const resources = { files: { uploadFile } } as never;

    const result = await uploadFolder({ resources, localPath: "/empty", remotePath: "w", public: true });

    expect(result).toEqual({ created: 0, failed: 0 });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  test("counts a per-file failure without aborting the run", async () => {
    mockTree({ "/dist": ["a.txt", "b.txt"] }, new Set(["/dist/a.txt", "/dist/b.txt"]));
    const uploadFile = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ file: "ok" });
    const resources = { files: { uploadFile } } as never;

    const result = await uploadFolder({ resources, localPath: "/dist", remotePath: "w", public: true });

    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
  });
});
