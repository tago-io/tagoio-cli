import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import type { IExport, IExportHolder } from "../types.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../../../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
}));

const getTokenByNameMock = vi.fn();
const deviceGetParametersMock = vi.fn();

vi.mock("@tago-io/sdk", async () => {
  const actual = await vi.importActual<object>("@tago-io/sdk");
  return {
    ...actual,
    Device: function Device() {
      return {
        getParameters: deviceGetParametersMock,
      };
    },
    Utils: {
      getTokenByName: (...args: unknown[]) => getTokenByNameMock(...args),
    },
  };
});

vi.mock("../../../../lib/replace-obj.js", () => ({
  replaceObj: (obj: unknown) => obj,
}));

describe("deviceExport", () => {
  let account: ReturnType<typeof makeAccount>;
  let importAccount: ReturnType<typeof makeAccount>;

  beforeEach(() => {
    vi.useFakeTimers();
    account = makeAccount();
    importAccount = makeAccount();
    getTokenByNameMock.mockReset();
    deviceGetParametersMock.mockReset();
    errorHandlerMock.mockClear().mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
  });

  const makeHolder = (): IExportHolder => ({
    devices: {},
    analysis: {},
    dashboards: {},
    tokens: {},
    config: { export_tag: "export_id" },
  });

  const makeConfig = (): IExport => ({
    export_tag: "export_id",
    entities: [],
    data: undefined,
    export: { token: "src-token", region: "us-e1" },
    import: { token: "tgt-token", region: "us-e1" },
  });

  test("returns the export_holder when both device lists are empty", async () => {
    account.devices.list.mockResolvedValue([]);
    importAccount.devices.list.mockResolvedValue([]);

    const { deviceExport } = await import("./devices-export.js");
    const holder = makeHolder();
    const result = await deviceExport(account as never, importAccount as never, holder, makeConfig());
    expect(result).toBe(holder);
  });

  test("creates a new device and replaces tokens when target is missing", async () => {
    account.devices.list.mockResolvedValue([{ id: "d1", name: "Dev 1" }]);
    importAccount.devices.list.mockResolvedValue([]);
    account.devices.info.mockResolvedValue({
      id: "d1",
      name: "Dev 1",
      tags: [{ key: "export_id", value: "v1" }],
      bucket: "bkt-1",
    });
    account.devices.tokenList.mockResolvedValue([]);
    importAccount.devices.tokenList.mockResolvedValue([]);
    importAccount.devices.create.mockResolvedValue({ device_id: "new-id", token: "new-token" });
    importAccount.devices.paramSet.mockResolvedValue(undefined);
    getTokenByNameMock.mockResolvedValue("src-token");
    deviceGetParametersMock.mockResolvedValue([{ id: "p1", key: "k", value: "v", sent: false }]);

    const { deviceExport } = await import("./devices-export.js");
    const holder = makeHolder();
    const promise = deviceExport(account as never, importAccount as never, holder, makeConfig());
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(importAccount.devices.create).toHaveBeenCalled();
    expect(importAccount.devices.paramSet).toHaveBeenCalled();
    expect(result.devices["d1"]).toBe("new-id");
    expect(result.tokens["src-token"]).toBe("new-token");
  });

  test("edits an existing device when target is found in import list", async () => {
    account.devices.list.mockResolvedValue([{ id: "d1", name: "Dev 1" }]);
    importAccount.devices.list.mockResolvedValue([
      { id: "tgt-id", tags: [{ key: "export_id", value: "v1" }] },
    ]);
    account.devices.info.mockResolvedValue({
      id: "d1",
      name: "Dev 1",
      tags: [{ key: "export_id", value: "v1" }],
      bucket: "bkt-1",
      parse_function: "code",
      active: true,
      visible: true,
    });
    account.devices.tokenList.mockResolvedValue([]);
    importAccount.devices.tokenList.mockResolvedValue([]);
    importAccount.devices.edit.mockResolvedValue(undefined);
    getTokenByNameMock.mockResolvedValueOnce("src-token").mockResolvedValueOnce("tgt-token");

    const { deviceExport } = await import("./devices-export.js");
    const holder = makeHolder();
    const promise = deviceExport(account as never, importAccount as never, holder, makeConfig());
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(importAccount.devices.edit).toHaveBeenCalled();
    expect(result.devices["d1"]).toBe("tgt-id");
  });

  test("routes devices.create rejection through errorHandler with the device name and SDK reason", async () => {
    account.devices.list.mockResolvedValue([{ id: "d1", name: "Dev Boom" }]);
    importAccount.devices.list.mockResolvedValue([]);
    account.devices.info.mockResolvedValue({
      id: "d1",
      name: "Dev Boom",
      tags: [{ key: "export_id", value: "v1" }],
      bucket: "bkt-1",
    });
    account.devices.tokenList.mockResolvedValue([]);
    importAccount.devices.create.mockRejectedValue(new Error("Invalid connector"));
    getTokenByNameMock.mockResolvedValue("src-token");

    const { deviceExport } = await import("./devices-export.js");
    const holder = makeHolder();
    const promise = deviceExport(account as never, importAccount as never, holder, makeConfig());
    const expectation = expect(promise).rejects.toThrow(/Failed to create device "Dev Boom"/);
    await vi.runAllTimersAsync();
    await expectation;
    expect(errorHandlerMock).toHaveBeenCalledWith(expect.stringContaining("Invalid connector"));
  });

  test("routes devices.edit rejection through errorHandler with the device name and SDK reason", async () => {
    account.devices.list.mockResolvedValue([{ id: "d1", name: "Dev Boom" }]);
    importAccount.devices.list.mockResolvedValue([
      { id: "tgt-id", tags: [{ key: "export_id", value: "v1" }] },
    ]);
    account.devices.info.mockResolvedValue({
      id: "d1",
      name: "Dev Boom",
      tags: [{ key: "export_id", value: "v1" }],
      bucket: "bkt-1",
      parse_function: "code",
      active: true,
      visible: true,
    });
    account.devices.tokenList.mockResolvedValue([]);
    importAccount.devices.edit.mockRejectedValue(new Error("Invalid network"));
    getTokenByNameMock.mockResolvedValue("src-token");

    const { deviceExport } = await import("./devices-export.js");
    const holder = makeHolder();
    const promise = deviceExport(account as never, importAccount as never, holder, makeConfig());
    const expectation = expect(promise).rejects.toThrow(/Failed to update device "Dev Boom"/);
    await vi.runAllTimersAsync();
    await expectation;
    expect(errorHandlerMock).toHaveBeenCalledWith(expect.stringContaining("Invalid network"));
  });

  test("regenerates tokens when source tokens carry serial numbers", async () => {
    account.devices.list.mockResolvedValue([{ id: "d1", name: "Dev 1" }]);
    importAccount.devices.list.mockResolvedValue([]);
    account.devices.info.mockResolvedValue({
      id: "d1",
      name: "Dev 1",
      tags: [{ key: "export_id", value: "v1" }],
      bucket: "bkt-1",
    });
    // Source has a token with serial number → regeneration kicks in
    account.devices.tokenList.mockResolvedValue([
      { name: "T1", permission: "full", serie_number: "SN-1" },
    ]);
    importAccount.devices.tokenList.mockResolvedValue([{ serie_number: "SN-OLD", token: "old-token" }]);
    importAccount.devices.create.mockResolvedValue({ device_id: "new-id", token: "new-token" });
    importAccount.devices.tokenDelete.mockResolvedValue(undefined);
    importAccount.devices.tokenCreate.mockResolvedValue(undefined);
    importAccount.devices.paramSet.mockResolvedValue(undefined);
    getTokenByNameMock.mockResolvedValue("src-token");
    deviceGetParametersMock.mockResolvedValue([]);

    const { deviceExport } = await import("./devices-export.js");
    const holder = makeHolder();
    const promise = deviceExport(account as never, importAccount as never, holder, makeConfig());
    await vi.runAllTimersAsync();
    await promise;

    expect(importAccount.devices.tokenDelete).toHaveBeenCalledWith("old-token");
    expect(importAccount.devices.tokenCreate).toHaveBeenCalledWith(
      "new-id",
      expect.objectContaining({ serie_number: "SN-1", name: "T1" }),
    );
  });
});
