import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResolvedScope } from "../lib/resolve-scope.js";

const readFileSyncMock = vi.fn();
const resolveScopeMock = vi.fn<() => ResolvedScope>();
const readTokenMock = vi.fn();
const errorHandlerMock = vi.fn<(str: unknown) => never>(() => {
  throw new Error("errorHandler called");
});

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
}));

vi.mock("../lib/resolve-scope.js", () => ({
  resolveScope: () => resolveScopeMock(),
}));

vi.mock("../lib/token.js", () => ({
  readToken: readTokenMock,
}));

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
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
  configExists: true,
};

const sampleConfig = {
  default: "prod",
  prod: {
    id: "65f8320d-cafe-cafe-cafe-cafecafecafe",
    profileName: "Tago Production",
    email: "user@tago.io",
  },
};

const KNOWN_TOKEN_UUID = "11111111-2222-3333-4444-555555555555";

describe("whoami", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let consoleTableSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    readFileSyncMock.mockReset().mockReturnValue(JSON.stringify(sampleConfig));
    resolveScopeMock.mockReset().mockReturnValue(localScope);
    readTokenMock.mockReset().mockReturnValue(KNOWN_TOKEN_UUID);
    errorHandlerMock.mockClear();
    process.env.TAGOIO_DEFAULT = "prod";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    consoleTableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.TAGOIO_DEFAULT;
    vi.restoreAllMocks();
  });

  test("--json prints a single JSON object on stdout with all seven fields", async () => {
    const { whoami } = await import("./whoami.js");
    await whoami({ json: true });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const written = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({
      scope: "local",
      loadedFrom: "/repo/tagoconfig.json",
      activeEnv: "prod",
      profileId: "65f8320d-cafe-cafe-cafe-cafecafecafe",
      profileName: "Tago Production",
      email: "user@tago.io",
      token: "loaded",
    });
  });

  test("default form prints a 7-row table on stdout via console.table", async () => {
    const { whoami } = await import("./whoami.js");
    await whoami();

    expect(consoleTableSpy).toHaveBeenCalledOnce();
    const tableArg = consoleTableSpy.mock.calls[0][0] as Record<string, string>;
    expect(Object.keys(tableArg)).toEqual([
      "Scope",
      "Loaded from",
      "Active env",
      "Profile ID",
      "Profile name",
      "Email",
      "Token",
    ]);
    expect(tableArg.Token).toBe("loaded");
  });

  test("Token field reports 'missing' when readToken returns undefined", async () => {
    readTokenMock.mockReturnValue(undefined);
    const { whoami } = await import("./whoami.js");
    await whoami({ json: true });
    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.token).toBe("missing");
  });

  test("S3 — token UUID never appears in stdout or stderr (plain output)", async () => {
    readTokenMock.mockReturnValue(KNOWN_TOKEN_UUID);
    const { whoami } = await import("./whoami.js");
    await whoami();

    const allOutput =
      stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("") +
      stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("") +
      consoleTableSpy.mock.calls.map((c: unknown[]) => JSON.stringify(c[0])).join("");
    expect(allOutput).not.toContain(KNOWN_TOKEN_UUID);
  });

  test("S3 — token UUID never appears in --json output", async () => {
    readTokenMock.mockReturnValue(KNOWN_TOKEN_UUID);
    const { whoami } = await import("./whoami.js");
    await whoami({ json: true });

    const allOutput =
      stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("") +
      stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(allOutput).not.toContain(KNOWN_TOKEN_UUID);
  });

  test("falls back to '(none)' / 'N/A' when no env is selected", async () => {
    delete process.env.TAGOIO_DEFAULT;
    const { whoami } = await import("./whoami.js");
    await whoami({ json: true });
    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.activeEnv).toBe("(none)");
    expect(parsed.profileId).toBe("N/A");
    expect(parsed.profileName).toBe("N/A");
    expect(parsed.email).toBe("N/A");
    expect(parsed.token).toBe("missing");
  });

  test("scope=global is reflected in the output", async () => {
    resolveScopeMock.mockReturnValue(globalScope);
    const { whoami } = await import("./whoami.js");
    await whoami({ json: true });
    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.scope).toBe("global");
    expect(parsed.loadedFrom).toBe("/home/user/.config/tagoio/tagoconfig.json");
  });

  test("errors with init hint when global scope and no config file exists", async () => {
    resolveScopeMock.mockReturnValue({ ...globalScope, configExists: false });
    const { whoami } = await import("./whoami.js");
    await expect(whoami()).rejects.toThrow();
    expect(errorHandlerMock).toHaveBeenCalledOnce();
    expect(errorHandlerMock.mock.calls[0][0]).toContain("tagoio init --scope global");
  });

  test("errors with init hint when local scope and no config file exists", async () => {
    resolveScopeMock.mockReturnValue({ ...localScope, configExists: false });
    const { whoami } = await import("./whoami.js");
    await expect(whoami()).rejects.toThrow();
    expect(errorHandlerMock.mock.calls[0][0]).toContain("tagoio init");
  });
});
