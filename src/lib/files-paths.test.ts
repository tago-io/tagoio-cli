import { describe, expect, test, vi } from "vitest";

import { isFolderPath, listFilesRecursive, remapPrefix } from "./files-paths.js";

describe("isFolderPath", () => {
  test("treats a trailing-slash path as a folder", () => {
    expect(isFolderPath("custom-widgets/line-chart/")).toBe(true);
  });

  test("treats a path with no extension as a folder", () => {
    expect(isFolderPath("custom-widgets/line-chart")).toBe(true);
  });

  test("treats a path with a file extension as a file", () => {
    expect(isFolderPath("custom-widgets/line-chart/index.html")).toBe(false);
    expect(isFolderPath("report.pdf")).toBe(false);
  });

  test("treats a dotfile-free nested segment as a folder", () => {
    expect(isFolderPath("a/b/c")).toBe(true);
  });
});

describe("remapPrefix", () => {
  test("rewrites the from-prefix to the to-prefix", () => {
    expect(remapPrefix("/custom-widgets/lc/index.html", "custom-widgets/lc", "backups/lc")).toBe("/backups/lc/index.html");
  });

  test("handles prefixes with or without a leading slash on the file", () => {
    expect(remapPrefix("custom-widgets/lc/sub/app.js", "custom-widgets/lc", "x/y")).toBe("x/y/sub/app.js");
  });

  test("leaves a file untouched when it is not under the from-prefix", () => {
    expect(remapPrefix("other/file.txt", "custom-widgets/lc", "backups/lc")).toBe("other/file.txt");
  });
});

describe("listFilesRecursive", () => {
  test("flattens files across nested folders", async () => {
    const list = vi.fn();
    // root prefix has one file and one subfolder; the subfolder has one file.
    list.mockImplementation(({ path }: { path: string }) => {
      if (path === "custom-widgets/lc" || path === "custom-widgets/lc/") {
        return Promise.resolve({ files: [{ filename: "custom-widgets/lc/index.html" }], folders: ["custom-widgets/lc/sub"] });
      }
      if (path === "custom-widgets/lc/sub" || path === "custom-widgets/lc/sub/") {
        return Promise.resolve({ files: [{ filename: "custom-widgets/lc/sub/app.js" }], folders: [] });
      }
      return Promise.resolve({ files: [], folders: [] });
    });
    const resources = { files: { list } } as never;

    const result = await listFilesRecursive(resources, "custom-widgets/lc");

    expect(result.sort()).toEqual(["custom-widgets/lc/index.html", "custom-widgets/lc/sub/app.js"]);
  });

  test("returns an empty array for an empty prefix", async () => {
    const list = vi.fn().mockResolvedValue({ files: [], folders: [] });
    const resources = { files: { list } } as never;

    expect(await listFilesRecursive(resources, "empty/path")).toEqual([]);
  });
});
