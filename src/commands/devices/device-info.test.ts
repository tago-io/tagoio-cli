import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// oxlint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, "");

const accountInfoMock = vi.fn();
const accountParamListMock = vi.fn();
const accountTokenListMock = vi.fn();
const deviceInfoMock = vi.fn();
const pickDeviceIDFromTagoIOMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Account: vi.fn(function Account() {
    return {
      devices: {
        info: accountInfoMock,
        paramList: accountParamListMock,
        tokenList: accountTokenListMock,
      },
    };
  }),
  Device: vi.fn(function Device() {
    return { info: deviceInfoMock };
  }),
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: vi.fn(() => ({
    profileToken: "fake-token",
    profileRegion: "usa-1",
  })),
}));

vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: (...args: unknown[]) => pickDeviceIDFromTagoIOMock(...args),
}));

describe("deviceInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountParamListMock.mockResolvedValue([]);
    accountTokenListMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("prints table when device is found via account.devices.info", async () => {
    accountInfoMock.mockResolvedValue({
      id: "dev-1",
      name: "Test Device",
      connector: "c",
      network: "n",
      active: true,
      visible: true,
      type: "mutable",
      tags: [],
      created_at: null,
      last_input: null,
      updated_at: null,
    });
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { deviceInfo } = await import("./device-info.js");
    await deviceInfo("dev-1", { environment: "dev", raw: false, json: false, tokens: false });
    expect(tableSpy).toHaveBeenCalled();
    tableSpy.mockRestore();
  });

  test("prints JSON when options.json is true", async () => {
    accountInfoMock.mockResolvedValue({
      id: "dev-1",
      name: "Test",
      tags: [],
      created_at: null,
      last_input: null,
      updated_at: null,
    });
    const dirSpy = vi.spyOn(console, "dir").mockImplementation(() => undefined);

    const { deviceInfo } = await import("./device-info.js");
    await deviceInfo("dev-1", { environment: "dev", raw: false, json: true, tokens: false });
    expect(dirSpy).toHaveBeenCalled();
    dirSpy.mockRestore();
  });

  test("fetches token list when options.tokens is true", async () => {
    accountInfoMock.mockResolvedValue({
      id: "dev-1",
      name: "Test",
      tags: [],
      created_at: null,
      last_input: null,
      updated_at: null,
    });
    accountTokenListMock.mockResolvedValue([{ name: "t", token: "xxx" }]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { deviceInfo } = await import("./device-info.js");
    await deviceInfo("dev-1", { environment: "dev", raw: false, json: false, tokens: true });
    expect(accountTokenListMock).toHaveBeenCalled();
  });

  test("prompts for device id when not provided", async () => {
    pickDeviceIDFromTagoIOMock.mockResolvedValue("picked-id");
    accountInfoMock.mockResolvedValue({
      id: "picked-id",
      name: "Picked",
      tags: [],
      created_at: null,
      last_input: null,
      updated_at: null,
    });
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { deviceInfo } = await import("./device-info.js");
    await deviceInfo("", { environment: "dev", raw: false, json: false, tokens: false });
    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalled();
  });

  test("falls back to Device token lookup when account lookup fails", async () => {
    accountInfoMock.mockRejectedValue(new Error("not found"));
    deviceInfoMock.mockResolvedValue({
      id: "dev-from-device",
      name: "Device",
      tags: [],
      created_at: null,
      last_input: null,
      updated_at: null,
    });
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { deviceInfo } = await import("./device-info.js");
    await deviceInfo("some-token", { environment: "dev", raw: false, json: false, tokens: false });
    expect(deviceInfoMock).toHaveBeenCalled();
  });
});

describe("deviceInfo — not-found branch", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    accountInfoMock.mockReset();
    deviceInfoMock.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code}`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("routes through errorHandler when both account and device lookups fail (exit 1, [ERROR] prefix, stderr)", async () => {
    accountInfoMock.mockRejectedValue(new Error("not found"));
    deviceInfoMock.mockRejectedValue(new Error("not found"));

    const { deviceInfo } = await import("./device-info.js");

    await expect(
      deviceInfo("missing-id", {
        environment: "dev",
        raw: false,
        json: false,
        tokens: false,
      }),
    ).rejects.toThrow("__exit:1");

    expect(exit).toHaveBeenCalledWith(1);
    expect(consoleError).toHaveBeenCalled();
    const output = stripAnsi(String(consoleError.mock.calls[0][0]));
    expect(output).toContain("[ERROR]");
    expect(output).toContain("missing-id");
  });
});
