import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const uploadMock = vi.fn();
const buildMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

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
  requireLocalScope: () => ({ scope: "local", root: "/repo" }),
}));

vi.mock("../../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("../../lib/custom-widget-transport.js", () => ({
  MAX_SOURCE_BYTES: 1024 * 1024,
  uploadWidgetSource: uploadMock,
}));

vi.mock("../../lib/widget-build.js", () => ({
  buildWidget: buildMock,
}));

const D = "6a68b4f5e4b1e5000b5ab1ef";
const LIST = [
  { folder: "users-summary", dashboard_id: D, widget_id: "6ad1084c174a0b000cb231a4" },
  { folder: "users-summary", dashboard_id: D, widget_id: "6ad1084d5a0327000c5ac4ef" },
  { folder: "alerts", dashboard_id: D, widget_id: "6ad107db174a0b000cb212b5" },
];

const SUCCESS = { kind: "outcome", outcome: { success: true, error: null, warnings: [], artifactURL: "https://files/x.html" } };

function context() {
  return {
    resources: resourcesInstance as never,
    transport: { apiURL: "https://api.us-e1.tago.io", token: "t" },
    projectRoot: "/repo",
    widgetPath: "./widgets",
    buildPath: "./build",
  };
}

describe("selectEntries", () => {
  test("a folder selects every placement of it", async () => {
    const { selectEntries } = await import("./widget-deploy.js");

    expect(await selectEntries(LIST, "users-summary", {})).toEqual(LIST.slice(0, 2));
  });

  test("an unknown folder names the closest one instead of guessing", async () => {
    const { selectEntries } = await import("./widget-deploy.js");

    await expect(selectEntries(LIST, "user-summary", {})).rejects.toThrow(/No widget folder "user-summary".*Did you mean "users-summary"/);
  });

  test("--all takes everything, and --silent without a folder fails", async () => {
    const { selectEntries } = await import("./widget-deploy.js");

    expect(await selectEntries(LIST, undefined, { all: true })).toEqual(LIST);
    await expect(selectEntries(LIST, undefined, { silent: true })).rejects.toThrow(/missing_input/);
  });

  test("an empty widgetList points at widget-create", async () => {
    const { selectEntries } = await import("./widget-deploy.js");

    await expect(selectEntries([], "x", {})).rejects.toThrow(/no_widgets.*widget-create --folder/);
  });
});

describe("deployEntries", () => {
  beforeEach(() => {
    resourcesInstance = makeAccount();
    uploadMock.mockReset().mockResolvedValue(SUCCESS);
    buildMock.mockReset().mockResolvedValue({ source: "// tailwind\nexport default App;", outFile: "/repo/build/widgets/x.tsx", bytes: 31 });
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ type: "iframe" });
  });

  test("builds a folder once and uploads it to each of its placements", async () => {
    const { deployEntries } = await import("./widget-deploy.js");

    const results = await deployEntries(context(), LIST.slice(0, 2));

    expect(buildMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.status)).toEqual(["deployed", "deployed"]);
  });

  test("a widget that is not a custom widget is refused before any upload", async () => {
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ type: "display" });
    const { deployEntries } = await import("./widget-deploy.js");

    const [result] = await deployEntries(context(), [LIST[2]]);

    expect(result).toMatchObject({ status: "rejected", error: 'widget is a "display" widget, not a custom widget' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  test("a bundle failure fails that placement and says the previous build stays live", async () => {
    uploadMock.mockResolvedValue({ kind: "outcome", outcome: { success: false, error: "PARSE_ERROR", warnings: [], artifactURL: null } });
    const { deployEntries } = await import("./widget-deploy.js");

    const [result] = await deployEntries(context(), [LIST[2]]);

    expect(result.status).toBe("bundle_failed");
    expect(result.error).toMatch(/PARSE_ERROR.*keeps rendering its previous build/);
  });

  test("the upload limit is waited out once", async () => {
    uploadMock.mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 0 }).mockResolvedValueOnce(SUCCESS);
    const { deployEntries } = await import("./widget-deploy.js");

    const [result] = await deployEntries(context(), [LIST[2]]);

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("deployed");
  });

  /** A timeout or dropped connection must not abort the run or lose the other results. */
  test("an upload that throws fails that placement and the next one still deploys", async () => {
    uploadMock.mockRejectedValueOnce(new Error("The operation was aborted due to timeout")).mockResolvedValueOnce(SUCCESS);
    const { deployEntries } = await import("./widget-deploy.js");

    const results = await deployEntries(context(), LIST.slice(0, 2));

    expect(results.map((result) => result.status)).toEqual(["rejected", "deployed"]);
    expect(results[0].error).toMatch(/aborted due to timeout/);
  });

  test("a Retry-After past two minutes fails the placement instead of stalling", async () => {
    uploadMock.mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 600 });
    const { deployEntries } = await import("./widget-deploy.js");

    const [result] = await deployEntries(context(), [LIST[2]]);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "rejected", error: "upload limit reached; the API asks to wait 600s" });
  });

  test("a build over the platform's 1 MiB cap fails without uploading", async () => {
    buildMock.mockResolvedValue({ source: "x", outFile: "/repo/build/widgets/x.tsx", bytes: 1024 * 1024 + 1 });
    const { deployEntries } = await import("./widget-deploy.js");

    const [result] = await deployEntries(context(), [LIST[2]]);

    expect(result).toMatchObject({ status: "build_failed", error: "the built source has 1048577 bytes, over the 1048576 byte limit" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  test("a prebuilt folder is uploaded without building again", async () => {
    const { deployEntries } = await import("./widget-deploy.js");

    await deployEntries(context(), [LIST[2]], new Map([["alerts", { source: "prebuilt", outFile: "/x.tsx", bytes: 8 }]]));

    expect(buildMock).not.toHaveBeenCalled();
    expect(uploadMock.mock.calls[0][1].source).toBe("prebuilt");
  });

  test("a build failure fails every placement of the folder without uploading", async () => {
    buildMock.mockRejectedValue(new Error('users-summary: "luxon" is imported but not declared'));
    const { deployEntries } = await import("./widget-deploy.js");

    const results = await deployEntries(context(), LIST.slice(0, 2));

    expect(results.map((result) => result.status)).toEqual(["build_failed", "build_failed"]);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  test("--dry-run builds without reading or uploading any widget", async () => {
    const { deployEntries } = await import("./widget-deploy.js");

    const [result] = await deployEntries({ ...context(), dryRun: true }, [LIST[2]]);

    expect(result.status).toBe("built");
    expect(resourcesInstance.dashboards.widgets.info).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("widgetDeploy", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ type: "iframe" });
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig({ widgetList: LIST }));
    buildMock.mockReset().mockResolvedValue({ source: "x", outFile: "/repo/build/widgets/x.tsx", bytes: 1 });
    uploadMock.mockReset().mockResolvedValue(SUCCESS);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("--json reports every placement", async () => {
    const { widgetDeploy } = await import("./widget-deploy.js");
    await widgetDeploy(undefined, { all: true, json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toHaveLength(3);
  });

  test("any failed placement makes the command fail", async () => {
    uploadMock.mockResolvedValueOnce({ kind: "request_error", message: "Authorization denied" });
    const { widgetDeploy } = await import("./widget-deploy.js");

    await expect(widgetDeploy("alerts", {})).rejects.toThrow(/deploy_failed: 1 of 1/);
  });

  test("--token replaces the lock-file token", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ widgetList: LIST, profileToken: "" }));
    const { widgetDeploy } = await import("./widget-deploy.js");

    await expect(widgetDeploy("alerts", {})).rejects.toThrow(/No profile token found/);
    await widgetDeploy("alerts", { token: "ci-token" });
    expect(uploadMock.mock.calls[0][0]).toEqual({ apiURL: "https://api.us-e1.tago.io", token: "ci-token" });
  });
});
