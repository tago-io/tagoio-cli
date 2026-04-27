import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const appendFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  appendFileSync: appendFileSyncMock,
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

describe("addOnGitIgnore", () => {
  beforeEach(() => {
    appendFileSyncMock.mockReset();
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("no-ops when the target entry is already in .gitignore", async () => {
    readFileSyncMock.mockReturnValue(".tagoio\nnode_modules\n");
    existsSyncMock.mockReturnValue(true);

    const { addOnGitIgnore } = await import("./add-to-gitignore.js");
    addOnGitIgnore("/repo", ".tagoio");

    expect(appendFileSyncMock).not.toHaveBeenCalled();
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  test("appends the entry with a trailing newline when .gitignore exists but lacks it", async () => {
    readFileSyncMock.mockReturnValue("node_modules\n");
    existsSyncMock.mockReturnValue(true);

    const { addOnGitIgnore } = await import("./add-to-gitignore.js");
    addOnGitIgnore("/repo", ".tagoio");

    expect(appendFileSyncMock).toHaveBeenCalledWith("/repo/.gitignore", ".tagoio\n", { encoding: "utf-8" });
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  test("creates .gitignore with the entry when the file does not exist", async () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    existsSyncMock.mockReturnValue(false);

    const { addOnGitIgnore } = await import("./add-to-gitignore.js");
    addOnGitIgnore("/new-repo", ".tagoio");

    expect(writeFileSyncMock).toHaveBeenCalledWith("/new-repo/.gitignore", ".tagoio\n", { encoding: "utf-8" });
    expect(appendFileSyncMock).not.toHaveBeenCalled();
  });

  test("swallows write errors (logs to console.error) so CLI flow continues", async () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    existsSyncMock.mockReturnValue(false);
    writeFileSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { addOnGitIgnore } = await import("./add-to-gitignore.js");
    addOnGitIgnore("/readonly", ".tagoio");

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
