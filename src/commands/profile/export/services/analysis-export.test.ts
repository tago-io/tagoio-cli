import { beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchArrayBufferResponse } from "../../../../test-utils/mock-fetch.js";
import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import type { IExportHolder } from "../types.js";

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: vi.fn(),
}));

let fetchMock: ReturnType<typeof installFetchMock>;

vi.mock("../../../../lib/replace-obj.js", () => ({
  replaceObj: (obj: unknown) => obj,
}));

describe("analysisExport", () => {
  let account: ReturnType<typeof makeAccount>;
  let importAccount: ReturnType<typeof makeAccount>;

  beforeEach(() => {
    account = makeAccount();
    importAccount = makeAccount();
    fetchMock = installFetchMock();
  });

  const makeHolder = (): IExportHolder => ({
    devices: {},
    analysis: {},
    dashboards: {},
    secrets: {},
    tokens: {},
    config: { export_tag: "export_id" },
  });

  test("returns the export_holder unchanged when lists are empty", async () => {
    account.analysis.list.mockResolvedValue([]);
    importAccount.analysis.list.mockResolvedValue([]);

    const { analysisExport } = await import("./analysis-export.js");
    const holder = makeHolder();
    const result = await analysisExport(account as never, importAccount as never, holder);
    expect(result).toBe(holder);
  });

  test("creates a new analysis when target is missing", async () => {
    account.analysis.list.mockResolvedValue([{ id: "a1", name: "A1", variables: [] }]);
    importAccount.analysis.list.mockResolvedValue([]);
    account.analysis.info.mockResolvedValue({
      id: "a1",
      name: "A1",
      tags: [{ key: "export_id", value: "v1" }],
      variables: [],
    });
    importAccount.analysis.create.mockResolvedValue({ id: "new-a" });
    account.analysis.downloadScript.mockResolvedValue({ url: "http://script.url" });
    importAccount.analysis.uploadScript.mockResolvedValue(undefined);
    // Build a gzipped buffer so zlib.gunzipSync works
    const zlib = await import("node:zlib");
    const raw = Buffer.from("console.log('x');");
    const gz = zlib.gzipSync(raw);
    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(gz));

    const { analysisExport } = await import("./analysis-export.js");
    const holder = makeHolder();
    const result = await analysisExport(account as never, importAccount as never, holder);
    expect(importAccount.analysis.create).toHaveBeenCalled();
    expect(importAccount.analysis.uploadScript).toHaveBeenCalled();
    expect(result.analysis["a1"]).toBe("new-a");
  });

  test("preserves the source runtime when uploading the script", async () => {
    account.analysis.list.mockResolvedValue([{ id: "a1", name: "A1", variables: [] }]);
    importAccount.analysis.list.mockResolvedValue([]);
    account.analysis.info.mockResolvedValue({
      id: "a1",
      name: "A1",
      tags: [{ key: "export_id", value: "v1" }],
      runtime: "deno-rt2025",
      variables: [],
    });
    importAccount.analysis.create.mockResolvedValue({ id: "new-a" });
    account.analysis.downloadScript.mockResolvedValue({ url: "http://script.url" });
    importAccount.analysis.uploadScript.mockResolvedValue(undefined);
    const zlib = await import("node:zlib");
    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(zlib.gzipSync(Buffer.from("code"))));

    const { analysisExport } = await import("./analysis-export.js");
    await analysisExport(account as never, importAccount as never, makeHolder());

    expect(importAccount.analysis.uploadScript).toHaveBeenCalledWith("new-a", expect.objectContaining({ language: "deno-rt2025" }));
  });

  test("defaults to node-legacy runtime when the source has none", async () => {
    account.analysis.list.mockResolvedValue([{ id: "a1", name: "A1", variables: [] }]);
    importAccount.analysis.list.mockResolvedValue([]);
    account.analysis.info.mockResolvedValue({
      id: "a1",
      name: "A1",
      tags: [{ key: "export_id", value: "v1" }],
      variables: [],
    });
    importAccount.analysis.create.mockResolvedValue({ id: "new-a" });
    account.analysis.downloadScript.mockResolvedValue({ url: "http://script.url" });
    importAccount.analysis.uploadScript.mockResolvedValue(undefined);
    const zlib = await import("node:zlib");
    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(zlib.gzipSync(Buffer.from("code"))));

    const { analysisExport } = await import("./analysis-export.js");
    await analysisExport(account as never, importAccount as never, makeHolder());

    // create gets the same defaulted runtime as uploadScript (parity), not a runtime-less object.
    expect(importAccount.analysis.create).toHaveBeenCalledWith(expect.objectContaining({ runtime: "node-legacy" }));
    expect(importAccount.analysis.uploadScript).toHaveBeenCalledWith("new-a", expect.objectContaining({ language: "node-legacy" }));
  });

  test("edits an existing analysis when target is found", async () => {
    account.analysis.list.mockResolvedValue([{ id: "a1", name: "A1", variables: [] }]);
    importAccount.analysis.list.mockResolvedValue([{ id: "tgt-a", tags: [{ key: "export_id", value: "v1" }], variables: [] }]);
    account.analysis.info.mockResolvedValue({
      id: "a1",
      name: "A1",
      tags: [{ key: "export_id", value: "v1" }],
      active: true,
      runtime: "deno-rt2025",
      variables: [],
    });
    importAccount.analysis.edit.mockResolvedValue(undefined);
    account.analysis.downloadScript.mockResolvedValue({ url: "http://script.url" });
    importAccount.analysis.uploadScript.mockResolvedValue(undefined);
    const zlib = await import("node:zlib");
    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(zlib.gzipSync(Buffer.from("code"))));

    const { analysisExport } = await import("./analysis-export.js");
    const holder = makeHolder();
    const result = await analysisExport(account as never, importAccount as never, holder);
    expect(importAccount.analysis.edit).toHaveBeenCalledWith("tgt-a", expect.objectContaining({ runtime: "deno-rt2025" }));
    expect(result.analysis["a1"]).toBe("tgt-a");
  });

  test("prompts the user to resolve duplicate env variable values", async () => {
    account.analysis.list.mockResolvedValue([{ id: "a1", name: "A1", variables: [{ key: "API_URL", value: "src.example" }] }]);
    importAccount.analysis.list.mockResolvedValue([
      {
        id: "tgt-a",
        tags: [{ key: "export_id", value: "v1" }],
        variables: [{ key: "API_URL", value: "tgt.example" }],
      },
    ]);
    account.analysis.info.mockResolvedValue({
      id: "a1",
      name: "A1",
      tags: [{ key: "export_id", value: "v1" }],
      active: true,
      variables: [{ key: "API_URL", value: "src.example" }],
    });
    importAccount.analysis.edit.mockResolvedValue(undefined);
    account.analysis.downloadScript.mockResolvedValue({ url: "http://script.url" });
    importAccount.analysis.uploadScript.mockResolvedValue(undefined);
    const zlib = await import("node:zlib");
    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(zlib.gzipSync(Buffer.from("code"))));

    const prompts = (await import("prompts")).default;
    prompts.inject(["tgt.example"]);

    const { analysisExport } = await import("./analysis-export.js");
    const holder = makeHolder();
    await analysisExport(account as never, importAccount as never, holder);
    // edit is called once for the initial upsert and once more to apply the resolved variable
    expect(importAccount.analysis.edit).toHaveBeenCalledTimes(2);
  });

  test("handles analyses with missing variables array without throwing", async () => {
    account.analysis.list.mockResolvedValue([{ id: "a1", name: "A1" }]);
    importAccount.analysis.list.mockResolvedValue([]);
    account.analysis.info.mockResolvedValue({
      id: "a1",
      name: "A1",
      tags: [{ key: "export_id", value: "v1" }],
    });
    importAccount.analysis.create.mockResolvedValue({ id: "new-a" });
    account.analysis.downloadScript.mockResolvedValue({ url: "http://script.url" });
    importAccount.analysis.uploadScript.mockResolvedValue(undefined);
    const zlib = await import("node:zlib");
    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(zlib.gzipSync(Buffer.from("code"))));

    const { analysisExport } = await import("./analysis-export.js");
    const holder = makeHolder();
    const result = await analysisExport(account as never, importAccount as never, holder);
    expect(result.analysis["a1"]).toBe("new-a");
  });
});
