import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, infoMSGMock, listMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { files: { list: listMock } };
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: (...args: unknown[]) => getEnvironmentConfigMock(...args),
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: infoMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

import { filesListCommand } from "./list.js";

describe("filesListCommand", () => {
  let stdout: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    stdout = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    listMock.mockResolvedValue({
      files: [{ filename: "custom-widgets/lc/index.html", size: 390 }],
      folders: ["custom-widgets/lc/sub"],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("lists folders and files under a path", async () => {
    await filesListCommand("custom-widgets/lc", {});

    const out = stdout.join("");
    expect(out).toContain("custom-widgets/lc/sub");
    expect(out).toContain("custom-widgets/lc/index.html");
    // The API only returns a folder's contents when the path ends with a slash.
    expect(listMock).toHaveBeenCalledWith({ path: "custom-widgets/lc/" });
  });

  test("does not append a slash when the path already ends with one", async () => {
    await filesListCommand("custom-widgets/lc/", {});

    expect(listMock).toHaveBeenCalledWith({ path: "custom-widgets/lc/" });
  });

  test("emits a JSON object on stdout with --json", async () => {
    await filesListCommand("custom-widgets/lc", { json: true });

    const parsed = JSON.parse(stdout.join(""));
    expect(parsed.folders).toEqual(["custom-widgets/lc/sub"]);
    expect(parsed.files).toEqual([{ filename: "custom-widgets/lc/index.html", size: 390 }]);
  });

  test("lists the root when no path is given", async () => {
    await filesListCommand(undefined, {});

    expect(listMock).toHaveBeenCalledWith({ path: "" });
  });

  test("fails fast when no profile token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(filesListCommand("x", {})).rejects.toThrow(/token/i);
  });
});
