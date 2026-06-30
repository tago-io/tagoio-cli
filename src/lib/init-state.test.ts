import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResolvedScope } from "./resolve-scope.js";

const existsSyncMock = vi.fn<(path: string) => boolean>();
const readFileSyncMock = vi.fn<(path: string, encoding: string) => string>();
const resolveScopeMock = vi.fn<() => ResolvedScope>();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

vi.mock("./resolve-scope.js", () => ({
  resolveScope: () => resolveScopeMock(),
}));

const localScope: ResolvedScope = {
  scope: "local",
  root: "/repo",
  configPath: "/repo/tagoconfig.json",
  envFilePath: "/repo/.tagoio/personal.env",
  configExists: true,
};

const globalScope: ResolvedScope = {
  scope: "global",
  root: "/home/user/.config/tagoio",
  configPath: "/home/user/.config/tagoio/tagoconfig.json",
  envFilePath: "/home/user/.config/tagoio/.tagoio/personal.env",
  configExists: false,
};

describe("detectInitState", () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    existsSyncMock.mockReset().mockReturnValue(false);
    readFileSyncMock.mockReset();
    resolveScopeMock.mockReset().mockReturnValue(localScope);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    vi.restoreAllMocks();
  });

  test("returns local scope, configExists=true, envExists=true when env block present", async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ dev: { id: "x" }, prod: { id: "y" } }));
    existsSyncMock.mockImplementation((p) => p === "/repo/.tago-lock.dev.lock");
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    const { detectInitState } = await import("./init-state.js");
    const state = detectInitState("dev");

    expect(state.scope.scope).toBe("local");
    expect(state.configExists).toBe(true);
    expect(state.envExists).toBe(true);
    expect(state.tokenExists).toBe(true);
    expect(state.isTTY).toBe(true);
  });

  test("envExists=false when the requested env is not in the config", async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ prod: { id: "y" } }));

    const { detectInitState } = await import("./init-state.js");
    expect(detectInitState("dev").envExists).toBe(false);
  });

  test("envExists=false on malformed config (parse error)", async () => {
    readFileSyncMock.mockReturnValue("not-json {{");

    const { detectInitState } = await import("./init-state.js");
    expect(detectInitState("dev").envExists).toBe(false);
  });

  test("configExists=false propagates from resolveScope, envExists never set", async () => {
    resolveScopeMock.mockReturnValue(globalScope);

    const { detectInitState } = await import("./init-state.js");
    const state = detectInitState("dev");
    expect(state.configExists).toBe(false);
    expect(state.envExists).toBe(false);
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  test("tokenExists reflects the .tago-lock.<env>.lock probe", async () => {
    readFileSyncMock.mockReturnValue("{}");
    existsSyncMock.mockImplementation((p) => p === "/repo/.tago-lock.staging.lock");

    const { detectInitState } = await import("./init-state.js");
    expect(detectInitState("staging").tokenExists).toBe(true);
    expect(detectInitState("dev").tokenExists).toBe(false);
  });

  test("isTTY=false when stdin is not a terminal", async () => {
    readFileSyncMock.mockReturnValue("{}");
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });

    const { detectInitState } = await import("./init-state.js");
    expect(detectInitState("dev").isTTY).toBe(false);
  });
});
