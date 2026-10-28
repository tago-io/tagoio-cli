import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const readWidgetSourceMock = vi.fn();
let projectRoot: string;

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
  getApiURL: () => "https://api.us-e1.tago.io",
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../lib/resolve-scope.js", () => ({
  requireLocalScope: () => ({ scope: "local", root: projectRoot }),
}));

vi.mock("../../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("../../lib/custom-widget-transport.js", () => ({
  readWidgetSource: readWidgetSourceMock,
}));

const D = "6a68b4f5e4b1e5000b5ab1ef";
const LIST = [
  { folder: "users-summary", dashboard_id: D, widget_id: "6ad1084c174a0b000cb231a4" },
  { folder: "users-summary", dashboard_id: D, widget_id: "6ad1084d5a0327000c5ac4ef" },
];

describe("widgetPull", () => {
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "widget-pull-"));
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig({ widgetList: LIST, id: "6a91f697b1ccff000c3eb271" }));
    readWidgetSourceMock.mockReset().mockResolvedValue("// tailwind\nexport default App;");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("writes one file per placement into the build folder, never the widget folder", async () => {
    const { widgetPull } = await import("./widget-pull.js");
    await widgetPull("users-summary", {});

    for (const entry of LIST) {
      const file = join(projectRoot, "build", "widgets", `users-summary.${entry.widget_id}.published.tsx`);
      expect(readFileSync(file, "utf8")).toBe("// tailwind\nexport default App;");
    }
    expect(existsSync(join(projectRoot, "widgets"))).toBe(false);
    expect(readWidgetSourceMock.mock.calls[0][1]).toEqual({ profileID: "6a91f697b1ccff000c3eb271", widgetID: LIST[0].widget_id });
  });

  test("a widget without uploaded source fails the command", async () => {
    readWidgetSourceMock.mockResolvedValueOnce(null);
    const { widgetPull } = await import("./widget-pull.js");

    await expect(widgetPull("users-summary", {})).rejects.toThrow(/pull_failed: 1 of 2/);
  });
});
