import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});
const pickAnalysisMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-analysis-from-tagoio.js", () => ({
  pickAnalysisFromTagoIO: pickAnalysisMock,
}));

/** Body the fake download serves, so the re-upload can be asserted verbatim. */
const SCRIPT_BODY = 'console.log("original body");';

describe("analysisEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickAnalysisMock.mockReset().mockResolvedValue({ id: "ana1", name: "Alert Dispatch" });
    resourcesInstance.analysis.edit.mockResolvedValue("Successfully Updated");
    resourcesInstance.analysis.info.mockResolvedValue({
      id: "ana1",
      name: "Alert Dispatch",
      runtime: "node-rt2025",
      file_name: "existing.js",
      tags: [{ key: "env", value: "prod" }],
    });
    resourcesInstance.analysis.downloadScript.mockResolvedValue({ url: "https://example.invalid/script.gz" });
    resourcesInstance.analysis.uploadScript.mockResolvedValue("Successfully Uploaded");
    // `downloadScript` hands back a URL to a gzipped body, so the fetch and the
    // gunzip are what the command actually depends on.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => gzipSync(Buffer.from(SCRIPT_BODY)),
      })),
    );
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { name: "New", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("prompts for the analysis when the id is omitted", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit(undefined, { name: "New", var: [], tagkey: [], tagvalue: [] } as never);

    expect(pickAnalysisMock).toHaveBeenCalled();
    expect(resourcesInstance.analysis.edit).toHaveBeenCalledWith("ana1", expect.objectContaining({ name: "New" }));
  });

  test("--silent without an id fails and never prompts", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit(undefined, { name: "New", silent: true, var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/missing_input/);

    expect(pickAnalysisMock).not.toHaveBeenCalled();
  });

  test("each field patch reaches the payload without dragging others", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { description: "Updated", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1]).toEqual({ description: "Updated" });
  });

  test("several field patches combine", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", {
      name: "New",
      description: "Updated",
      runOn: "external",
      var: [],
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1]).toMatchObject({
      name: "New",
      description: "Updated",
      run_on: "external",
    });
  });

  /** Probed: `null` round-trips and reads back as null, so clearing works. */
  test("--description with an empty string clears it", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { description: "", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1]).toHaveProperty("description");
    expect(resourcesInstance.analysis.edit.mock.calls[0][1].description).toBeFalsy();
  });

  test("--activate sets active true", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { activate: true, var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1].active).toBe(true);
  });

  /** The type declares `active?: true`; probing showed false works. */
  test("--deactivate sets active false", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { deactivate: true, var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1].active).toBe(false);
  });

  test("--activate and --deactivate together fail before any call", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { activate: true, deactivate: true, var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.analysis.edit).not.toHaveBeenCalled();
  });

  test("--var replaces the variable set as an array of strings", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { var: ["A=1", "B=2"], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1].variables).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
  });

  test("--clear-vars sends an empty array", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { clearVars: true, var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1].variables).toEqual([]);
  });

  test("--var together with --clear-vars fails before any call", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { clearVars: true, var: ["A=1"], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.analysis.edit).not.toHaveBeenCalled();
  });

  test("a malformed --var fails offline", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { var: ["NOEQUALS"], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_variable/);

    expect(resourcesInstance.analysis.edit).not.toHaveBeenCalled();
  });

  test("--merge-tags preserves tags absent from the command line", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { mergeTags: true, var: [], tagkey: ["extra"], tagvalue: ["yes"] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1].tags).toEqual([
      { key: "env", value: "prod" },
      { key: "extra", value: "yes" },
    ]);
  });

  test("without --merge-tags the tag set is replaced and info is not called", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { var: [], tagkey: ["only"], tagvalue: ["this"] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1].tags).toEqual([{ key: "only", value: "this" }]);
    expect(resourcesInstance.analysis.info).not.toHaveBeenCalled();
  });

  /**
   * Changing the runtime is a script operation, not a field patch. Probed
   * against a live profile:
   *
   *   - upload alone with language=python-rt2025  -> python-rt2025
   *   - PUT deno + upload declaring node-rt2025   -> node-rt2025  (upload wins)
   *   - PUT deno with no upload, after 3s         -> unchanged
   *
   * So the runtime follows the `language` of the last upload. A PUT alone would
   * report success and change nothing, which is why --runtime re-uploads the
   * existing script under the new language instead.
   */
  test("--runtime re-uploads the existing script under the new language", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.uploadScript).toHaveBeenCalledWith("ana1", expect.objectContaining({ language: "python-rt2025" }));
  });

  test("--runtime preserves the script body byte-for-byte", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never);

    const uploaded = resourcesInstance.analysis.uploadScript.mock.calls[0][1];
    expect(Buffer.from(uploaded.content, "base64").toString("utf8")).toBe(SCRIPT_BODY);
  });

  test("--runtime keeps the existing file name", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.uploadScript.mock.calls[0][1].name).toBe("existing.js");
  });

  /** A PUT alone is a no-op, so it must not be sent as one. */
  test("--runtime alone does not send an empty edit patch", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit).not.toHaveBeenCalled();
  });

  test("--runtime combines with other field patches", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { name: "New", runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.edit.mock.calls[0][1]).toMatchObject({ name: "New" });
    expect(resourcesInstance.analysis.uploadScript).toHaveBeenCalled();
  });

  test("an invalid --runtime fails offline, before any call", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { runtime: "bogus", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_runtime/);

    expect(resourcesInstance.analysis.downloadScript).not.toHaveBeenCalled();
    expect(resourcesInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  /**
   * An analysis with no script has nothing to re-upload, and the API answers
   * the download with "Analysis file can't be found" — probed. Reporting that
   * plainly beats letting the raw error surface.
   */
  test("--runtime on an analysis with no script reports why it cannot work", async () => {
    resourcesInstance.analysis.downloadScript.mockRejectedValue(new Error("Analysis file can't be found"));

    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/no_script/);

    expect(resourcesInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  test("the no-script message says to deploy one first", async () => {
    resourcesInstance.analysis.downloadScript.mockRejectedValue(new Error("Analysis file can't be found"));

    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/analysis-deploy/);
  });

  test("--runtime equal to the current one is a no-op", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { runtime: "node-rt2025", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  test("an invalid --run-on fails offline", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { runOn: "moon", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_run_on/);

    expect(resourcesInstance.analysis.edit).not.toHaveBeenCalled();
  });

  test("an empty patch fails without a request", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.analysis.edit).not.toHaveBeenCalled();
  });

  test("--json synthesizes an ack, since the SDK resolves a plain string", async () => {
    const { analysisEdit } = await import("./analysis-edit.js");
    await analysisEdit("ana1", { name: "New", json: true, var: [], tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "ana1", updated: true });
  });

  /** A patch never carries a token, but an error handler echoing it could. */
  test("a rejected edit does not echo the patch", async () => {
    resourcesInstance.analysis.edit.mockRejectedValue(new Error("boom"));

    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { name: "SENTINEL_TOKEN_12345", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/edit_failed|boom/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.analysis.edit.mockRejectedValue(new Error("boom"));

    const { analysisEdit } = await import("./analysis-edit.js");
    await expect(analysisEdit("ana1", { name: "New", json: true, var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/^json:edit_failed:/);
  });
});
