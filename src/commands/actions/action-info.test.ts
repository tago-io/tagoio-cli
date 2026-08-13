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
const pickActionIDMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

// infoMSG and writeStatus keep their real stderr behavior so the tests can
// assert that nested output lands on stderr and never on stdout.
vi.mock("../../lib/messages.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/messages.js")>();
  return {
    ...actual,
    errorHandler: errorHandlerMock,
    errorHandlerJSON: errorHandlerJSONMock,
  };
});

vi.mock("../../prompt/pick-action-id-from-tagoio.js", () => ({
  pickActionIDFromTagoIO: pickActionIDMock,
}));

const sampleInfo = {
  id: "act1",
  name: "Alert",
  active: true,
  type: "condition",
  tags: [{ key: "env", value: "prod" }],
  trigger: [{ device: "dev1", variable: "temperature", is: ">", value: "30", value_type: "number" }],
  action: { type: "script", script: ["ana1"] },
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
  last_triggered: null,
};

describe("actionInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickActionIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { actionInfo } = await import("./action-info.js");
    await expect(actionInfo("act1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("uses the picker when no id is given", async () => {
    pickActionIDMock.mockResolvedValue("picked1");
    resourcesInstance.actions.info.mockResolvedValue(sampleInfo);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo(undefined, {} as never);

    expect(pickActionIDMock).toHaveBeenCalled();
    expect(resourcesInstance.actions.info).toHaveBeenCalledWith("picked1");
  });

  test("--silent without an id fails and never opens the picker", async () => {
    const { actionInfo } = await import("./action-info.js");
    await expect(actionInfo(undefined, { silent: true } as never)).rejects.toThrow(/Missing required input/);

    expect(pickActionIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.actions.info).not.toHaveBeenCalled();
  });

  test("--json emits the full action, trigger and action intact", async () => {
    resourcesInstance.actions.info.mockResolvedValue(sampleInfo);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", { json: true } as never);

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload.trigger).toEqual(sampleInfo.trigger);
    expect(payload.action).toEqual(sampleInfo.action);
  });

  /**
   * SPEC §3.2: the --json output must be a valid input to action-create's
   * JSON escape hatches, so an action can be read, edited, and recreated.
   */
  test("--json output round-trips through the builder JSON parsers", async () => {
    resourcesInstance.actions.info.mockResolvedValue(sampleInfo);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", { json: true } as never);

    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    const { parseJSONFlag } = await import("./action-builders.js");

    expect(parseJSONFlag(JSON.stringify(payload.trigger), "--trigger-json", "array")).toEqual(sampleInfo.trigger);
    expect(parseJSONFlag(JSON.stringify(payload.action), "--action-json", "object")).toEqual(sampleInfo.action);
  });

  test("human mode never renders a nested object as [object Object]", async () => {
    resourcesInstance.actions.info.mockResolvedValue(sampleInfo);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", {} as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain("[object Object]");
  });

  test("human mode writes the nested trigger/action to stderr, keeping stdout clean", async () => {
    resourcesInstance.actions.info.mockResolvedValue(sampleInfo);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", {} as never);

    expect(stdoutSpy).not.toHaveBeenCalled();
    const stderrOutput = stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("");
    expect(stderrOutput).toContain("temperature");
    expect(stderrOutput).toContain("script");
  });

  /**
   * `console.table` writes to stdout. Mocking it (as the test above does) hides
   * that, so this case leaves it real and watches the stream: in human mode
   * stdout must stay empty, because stdout is reserved for machine-readable
   * data and a piped `action-info` should yield nothing without --json.
   */
  test("human mode leaks nothing to stdout, including the scalar table", async () => {
    // Restore the real console.table, which writes to stdout. The other human-mode
    // test mocks it away, which would hide exactly the leak this case checks for.
    vi.restoreAllMocks();
    resourcesInstance.actions.info.mockResolvedValue(sampleInfo);
    const localStdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", {} as never);

    expect(localStdout).not.toHaveBeenCalled();
  });

  test("--raw keeps dates as ISO strings", async () => {
    resourcesInstance.actions.info.mockResolvedValue(sampleInfo);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", { json: true, raw: true } as never);

    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload.created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  // The API returns the literal string "never" for an action that has not
  // fired; formatting it as a Date crashes the command.
  test("renders an action whose last_triggered is the string 'never'", async () => {
    resourcesInstance.actions.info.mockResolvedValue({ ...sampleInfo, last_triggered: "never" });

    const { actionInfo } = await import("./action-info.js");
    await expect(actionInfo("act1", {} as never)).resolves.not.toThrow();
  });

  test("passes 'never' through to JSON output", async () => {
    resourcesInstance.actions.info.mockResolvedValue({ ...sampleInfo, last_triggered: "never" });

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).last_triggered).toBe("never");
  });

  /**
   * The API omits `last_triggered` entirely for an action that never fired.
   * Dropping the key from --json output would make a script consumer handle a
   * missing field; emit the "never" sentinel the SDK type documents instead.
   */
  test("--json always carries last_triggered, even when the API omits it", async () => {
    const { last_triggered: _omitted, ...withoutField } = sampleInfo;
    resourcesInstance.actions.info.mockResolvedValue(withoutField);

    const { actionInfo } = await import("./action-info.js");
    await actionInfo("act1", { json: true } as never);

    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect("last_triggered" in payload).toBe(true);
    expect(payload.last_triggered).toBe("never");
  });

  test("a missing action reports not_found", async () => {
    resourcesInstance.actions.info.mockRejectedValue(new Error("no such action"));

    const { actionInfo } = await import("./action-info.js");
    await expect(actionInfo("nope", {} as never)).rejects.toThrow(/not_found|no such action/);
  });

  test("a missing action reports through the JSON channel when --json is set", async () => {
    resourcesInstance.actions.info.mockRejectedValue(new Error("no such action"));

    const { actionInfo } = await import("./action-info.js");
    await expect(actionInfo("nope", { json: true } as never)).rejects.toThrow(/^json:not_found:/);
  });
});
