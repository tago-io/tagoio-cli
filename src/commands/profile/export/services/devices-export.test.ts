import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import type { IExport, IExportHolder } from "../types.js";

vi.mock("../../../../lib/messages.js", () => ({
  errorHandler: vi.fn(),
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
});
