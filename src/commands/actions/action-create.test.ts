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
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string, opts: { silent?: boolean; json?: boolean } = {}) => {
  if (value) {
    return value;
  }
  const message = `Missing required input: ${name}`;
  if (opts.json) {
    errorHandlerJSONMock(message, "missing_input");
  }
  errorHandlerMock(message);
});

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
  requireOrFail: requireOrFailMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

/** Minimal valid invocation: a condition trigger firing a script. */
const validOptions = {
  type: "condition",
  triggerDevice: "dev1",
  triggerVariable: "temperature",
  triggerIs: ">",
  triggerValue: "30",
  runScript: ["ana1"],
  tagkey: [],
  tagvalue: [],
};

describe("actionCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { actionCreate } = await import("./action-create.js");
    await expect(actionCreate("Alert", validOptions as never)).rejects.toThrow(/Environment not found/);
  });

  test("--silent without a name fails before any API call", async () => {
    const { actionCreate } = await import("./action-create.js");
    await expect(actionCreate(undefined, { ...validOptions, silent: true } as never)).rejects.toThrow(/Missing required input/);
    expect(resourcesInstance.actions.create).not.toHaveBeenCalled();
  });

  /**
   * The SDK's actions.create resolves { action: "<id>" } — not { id } like
   * devices.create's { device_id }. Reading the wrong key yields undefined ids
   * in --json output, which is the easiest bug to introduce by copying
   * device-create.ts.
   */
  test("--json reports the id from response.action", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-1" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Alert", { ...validOptions, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "act-1", name: "Alert" });
  });

  test("--json prefers response.action even when the payload also carries an id", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-1", id: "WRONG" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Alert", { ...validOptions, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).id).toBe("act-1");
  });

  test("builds a condition trigger firing a script", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-1" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Alert", validOptions as never);

    expect(resourcesInstance.actions.create).toHaveBeenCalledWith({
      name: "Alert",
      type: "condition",
      active: true,
      trigger: [{ device: "dev1", variable: "temperature", is: ">", value: "30", value_type: "number" }],
      action: { type: "script", script: ["ana1"] },
    });
  });

  test("builds a schedule trigger sending an email", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-2" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Daily", {
      type: "schedule",
      cron: "0 9 * * *",
      timezone: "UTC",
      email: "a@b.com",
      subject: "S",
      message: "M",
      tagkey: [],
      tagvalue: [],
    } as never);

    const payload = resourcesInstance.actions.create.mock.calls[0][0];
    expect(payload.trigger).toEqual([{ cron: "0 9 * * *", timezone: "UTC" }]);
    expect(payload.action).toEqual({ type: "email", to: "a@b.com", subject: "S", message: "M" });
  });

  test("builds an mqtt_topic trigger from typed flags", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-4" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Topic Watch", {
      type: "mqtt_topic",
      topic: "/device/#",
      triggerTagKey: "device_type",
      triggerTagValue: "sensor",
      runScript: ["ana1"],
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.actions.create.mock.calls[0][0].trigger).toEqual([{ topic: "/device/#", tag_key: "device_type", tag_value: "sensor" }]);
  });

  test("--action-json creates a target with no typed-flag support", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-3" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Queue", {
      ...validOptions,
      runScript: [],
      actionJson: '{"type":"queue-sqs","sqs_secret":"s1","batch_enabled":true}',
    } as never);

    expect(resourcesInstance.actions.create.mock.calls[0][0].action).toEqual({
      type: "queue-sqs",
      sqs_secret: "s1",
      batch_enabled: true,
    });
  });

  test("--inactive creates the action inactive", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-1" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Alert", { ...validOptions, inactive: true } as never);

    expect(resourcesInstance.actions.create.mock.calls[0][0].active).toBe(false);
  });

  test("tags reach the payload", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-1" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Alert", { ...validOptions, tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.actions.create.mock.calls[0][0].tags).toEqual([{ key: "env", value: "prod" }]);
  });

  test("--description reaches the payload", async () => {
    resourcesInstance.actions.create.mockResolvedValue({ action: "act-1" });

    const { actionCreate } = await import("./action-create.js");
    await actionCreate("Alert", { ...validOptions, description: "watches temp" } as never);

    expect(resourcesInstance.actions.create.mock.calls[0][0].description).toBe("watches temp");
  });

  test("an unknown --type is rejected offline and lists the valid set", async () => {
    const { actionCreate } = await import("./action-create.js");
    await expect(actionCreate("X", { ...validOptions, type: "bogus" } as never)).rejects.toThrow(/invalid_trigger_type/);
    expect(resourcesInstance.actions.create).not.toHaveBeenCalled();
  });

  test.each([
    ["missing_trigger_field", { ...validOptions, triggerDevice: undefined }],
    ["conflicting_trigger_input", { ...validOptions, triggerJson: "[]" }],
    ["missing_action", { ...validOptions, runScript: [] }],
    ["conflicting_action", { ...validOptions, notification: true, subject: "S", message: "M" }],
    ["invalid_json", { ...validOptions, runScript: [], actionJson: "{" }],
  ])("%s is caught before any API call", async (_code, options) => {
    const { actionCreate } = await import("./action-create.js");
    await expect(actionCreate("X", options as never)).rejects.toThrow();
    expect(resourcesInstance.actions.create).not.toHaveBeenCalled();
  });

  test("an API rejection reports create_failed", async () => {
    resourcesInstance.actions.create.mockRejectedValue(new Error("boom"));

    const { actionCreate } = await import("./action-create.js");
    await expect(actionCreate("Alert", validOptions as never)).rejects.toThrow(/create_failed|boom/);
  });

  test("an API rejection reports through the JSON channel when --json is set", async () => {
    resourcesInstance.actions.create.mockRejectedValue(new Error("boom"));

    const { actionCreate } = await import("./action-create.js");
    await expect(actionCreate("Alert", { ...validOptions, json: true } as never)).rejects.toThrow(/^json:create_failed:/);
  });
});
