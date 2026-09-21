import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import { IExportHolder } from "../types.js";
import { collectIDs, collectSecretIDs, getExportHolder } from "./collect-ids.js";

const getTokenByNameMock = vi.fn();
const infoMSGMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: infoMSGMock,
}));

vi.mock("@tago-io/sdk", async () => {
  const actual = await vi.importActual<object>("@tago-io/sdk");
  return {
    ...actual,
    Utils: {
      getTokenByName: (...args: unknown[]) => getTokenByNameMock(...args),
    },
  };
});

describe("Collect ID", () => {
  test("Get Export Holder - Devices", () => {
    const list = [
      { id: "Test1", token: "1234-1234-1234-1234", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "Test2", token: "1235-1235-1235-1235", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const import_list = [
      { id: "1Test", token: "4321-4321-4321-4321", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "2Test", token: "5321-5321-5321-5321", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const exportHolder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };

    getExportHolder(list, import_list, "devices", exportHolder);

    expect(exportHolder.devices).toStrictEqual({ Test1: "1Test", Test2: "2Test" });
    expect(exportHolder.tokens).toStrictEqual({ "1234-1234-1234-1234": "4321-4321-4321-4321", "1235-1235-1235-1235": "5321-5321-5321-5321" });
  });

  test("Get Export Holder - Devices Token not Found", () => {
    const list = [
      { id: "Test1", token: "1234-1234-1234-1234", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "Test2", token: "1235-1235-1235-1235", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const import_list = [
      { id: "1Test", name: "1Test", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "2Test", token: "5321-5321-5321-5321", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const exportHolder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };

    expect(() => Promise.reject(getExportHolder(list, import_list, "devices", exportHolder))).toThrow("Device Token not found: 1Test [1Test]");
  });

  test("skips items without a matching export tag on the source side", () => {
    const list = [{ id: "no-tag", tags: [{ key: "other", value: "x" }] }];
    const import_list = [{ id: "1", tags: [{ key: "export_id", value: "x" }] }];
    const holder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };

    getExportHolder(list, import_list, "analysis", holder);
    expect(holder.analysis).toEqual({});
  });

  test("skips items when the import side has no matching tag", () => {
    const list = [{ id: "a1", tags: [{ key: "export_id", value: "v" }] }];
    const import_list = [{ id: "b1", tags: [{ key: "export_id", value: "other" }] }];
    const holder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };

    getExportHolder(list, import_list, "analysis", holder);
    expect(holder.analysis).toEqual({});
  });

  test("maps non-device entities without touching tokens", () => {
    const list = [{ id: "dash-1", tags: [{ key: "export_id", value: "v" }] }];
    const import_list = [{ id: "dash-tgt", tags: [{ key: "export_id", value: "v" }] }];
    const holder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };

    getExportHolder(list, import_list, "dashboards", holder);
    expect(holder.dashboards).toEqual({ "dash-1": "dash-tgt" });
    expect(holder.tokens).toEqual({});
  });

  test("throws when source device lacks a token", () => {
    const list = [{ id: "src", name: "Src", tags: [{ key: "export_id", value: "v" }] }];
    const import_list = [{ id: "tgt", token: "t2", tags: [{ key: "export_id", value: "v" }] }];
    const holder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };

    expect(() => getExportHolder(list, import_list, "devices", holder)).toThrow(/Device Token not found: Src/);
  });
});

describe("collectIDs", () => {
  let account: ReturnType<typeof makeAccount>;
  let importAccount: ReturnType<typeof makeAccount>;

  beforeEach(() => {
    account = makeAccount();
    importAccount = makeAccount();
    getTokenByNameMock.mockReset();
  });

  test("collects IDs for a non-device entity without fetching tokens", async () => {
    account.analysis.list.mockResolvedValue([{ id: "a1", tags: [{ key: "export_id", value: "v" }] }]);
    importAccount.analysis.list.mockResolvedValue([{ id: "tgt-a", tags: [{ key: "export_id", value: "v" }] }]);

    const holder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };
    const result = await collectIDs(account as never, importAccount as never, "analysis", holder);

    expect(result.analysis).toEqual({ a1: "tgt-a" });
    expect(getTokenByNameMock).not.toHaveBeenCalled();
  });

  test("fetches device tokens via Utils.getTokenByName when entity is devices", async () => {
    account.devices.list.mockResolvedValue([{ id: "d1", tags: [{ key: "export_id", value: "v" }] }]);
    importAccount.devices.list.mockResolvedValue([{ id: "tgt-d", tags: [{ key: "export_id", value: "v" }] }]);
    getTokenByNameMock.mockResolvedValueOnce("src-token").mockResolvedValueOnce("tgt-token");

    const holder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } };
    const result = await collectIDs(account as never, importAccount as never, "devices", holder);

    expect(getTokenByNameMock).toHaveBeenCalledTimes(2);
    expect(result.devices).toEqual({ d1: "tgt-d" });
    expect(result.tokens).toEqual({ "src-token": "tgt-token" });
  });
});

describe("collectSecretIDs", () => {
  let resources: ReturnType<typeof makeAccount>;
  let importResources: ReturnType<typeof makeAccount>;

  const makeHolder = (): IExportHolder => ({ devices: {}, analysis: {}, dashboards: {}, secrets: {}, tokens: {}, config: { export_tag: "export_id" } });

  beforeEach(() => {
    resources = makeAccount();
    importResources = makeAccount();
    infoMSGMock.mockReset();
  });

  test("maps source secret IDs to target secret IDs by key", async () => {
    resources.secrets.list.mockResolvedValue([
      { id: "src-google", key: "GOOGLE_MAPS_KEY" },
      { id: "src-other", key: "OTHER" },
    ]);
    importResources.secrets.list.mockResolvedValue([
      { id: "tgt-other", key: "OTHER" },
      { id: "tgt-google", key: "GOOGLE_MAPS_KEY" },
    ]);

    const result = await collectSecretIDs(resources as never, importResources as never, makeHolder());

    expect(result.secrets).toEqual({ "src-google": "tgt-google", "src-other": "tgt-other" });
    expect(infoMSGMock).not.toHaveBeenCalled();
  });

  test("warns about secrets missing in the import profile and leaves them unmapped", async () => {
    resources.secrets.list.mockResolvedValue([
      { id: "src-google", key: "GOOGLE_MAPS_KEY" },
      { id: "src-missing", key: "MISSING_KEY" },
    ]);
    importResources.secrets.list.mockResolvedValue([{ id: "tgt-google", key: "GOOGLE_MAPS_KEY" }]);

    const result = await collectSecretIDs(resources as never, importResources as never, makeHolder());

    expect(result.secrets).toEqual({ "src-google": "tgt-google" });
    expect(infoMSGMock).toHaveBeenCalledWith(expect.stringContaining("MISSING_KEY"));
  });

  test("does not throw when listing secrets fails", async () => {
    resources.secrets.list.mockRejectedValue(new Error("Forbidden"));
    importResources.secrets.list.mockResolvedValue([]);

    const result = await collectSecretIDs(resources as never, importResources as never, makeHolder());

    expect(result.secrets).toEqual({});
    expect(infoMSGMock).toHaveBeenCalledWith(expect.stringContaining("Could not list secrets in the export profile"));
  });
});
