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
const pickSecretIDMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

// infoMSG and writeStatus keep their real stderr behaviour so the tests can
// prove the human view never reaches stdout.
vi.mock("../../lib/messages.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/messages.js")>();
  return { ...actual, errorHandler: errorHandlerMock, errorHandlerJSON: errorHandlerJSONMock };
});

vi.mock("../../prompt/pick-secret-id-from-tagoio.js", () => ({
  pickSecretIDFromTagoIO: pickSecretIDMock,
}));

/** `secrets.info` runs the SDK's dateParser, so these arrive as Date objects. */
const sampleInfo = {
  id: "sec1",
  key: "TWILIO_SID",
  tags: [{ key: "env", value: "prod" }],
  value_length: 34,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
};

describe("secretInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickSecretIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { secretInfo } = await import("./secret-info.js");
    await expect(secretInfo("sec1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("uses the picker when no id is given", async () => {
    pickSecretIDMock.mockResolvedValue("picked1");
    resourcesInstance.secrets.info.mockResolvedValue(sampleInfo);

    const { secretInfo } = await import("./secret-info.js");
    await secretInfo(undefined, {} as never);

    expect(resourcesInstance.secrets.info).toHaveBeenCalledWith("picked1");
  });

  test("--silent without an id fails and never opens the picker", async () => {
    const { secretInfo } = await import("./secret-info.js");
    await expect(secretInfo(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickSecretIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.secrets.info).not.toHaveBeenCalled();
  });

  test("--json carries key and value_length", async () => {
    resourcesInstance.secrets.info.mockResolvedValue(sampleInfo);

    const { secretInfo } = await import("./secret-info.js");
    await secretInfo("sec1", { json: true } as never);

    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload.key).toBe("TWILIO_SID");
    expect(payload.value_length).toBe(34);
  });

  // The API never returns a value; nothing here should invent one.
  test("--json output carries no value key", async () => {
    resourcesInstance.secrets.info.mockResolvedValue(sampleInfo);

    const { secretInfo } = await import("./secret-info.js");
    await secretInfo("sec1", { json: true } as never);

    expect("value" in JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toBe(false);
  });

  test("--raw keeps dates as ISO strings", async () => {
    resourcesInstance.secrets.info.mockResolvedValue(sampleInfo);

    const { secretInfo } = await import("./secret-info.js");
    await secretInfo("sec1", { json: true, raw: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  test("an ISO string date renders too, in case info ever matches list", async () => {
    resourcesInstance.secrets.info.mockResolvedValue({ ...sampleInfo, created_at: "2026-01-01T00:00:00.000Z" });

    const { secretInfo } = await import("./secret-info.js");
    await expect(secretInfo("sec1", {} as never)).resolves.not.toThrow();
  });

  /**
   * `console.table` writes to stdout. `action-info` shipped that leak and only
   * a functional test caught it, so this asserts against the real function
   * rather than a mock that would hide it.
   */
  test("human mode writes nothing to stdout", async () => {
    vi.restoreAllMocks();
    resourcesInstance.secrets.info.mockResolvedValue(sampleInfo);
    const localStdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { secretInfo } = await import("./secret-info.js");
    await secretInfo("sec1", {} as never);

    expect(localStdout).not.toHaveBeenCalled();
  });

  test("human mode renders the key and length on stderr", async () => {
    resourcesInstance.secrets.info.mockResolvedValue(sampleInfo);

    const { secretInfo } = await import("./secret-info.js");
    await secretInfo("sec1", {} as never);

    const written = stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("");
    expect(written).toContain("TWILIO_SID");
    expect(written).toContain("34");
  });

  test("an unknown id reports not_found", async () => {
    resourcesInstance.secrets.info.mockRejectedValue(new Error("no such secret"));

    const { secretInfo } = await import("./secret-info.js");
    await expect(secretInfo("nope", {} as never)).rejects.toThrow(/not_found|no such secret/);
  });

  test("an unknown id reports through the JSON channel when --json is set", async () => {
    resourcesInstance.secrets.info.mockRejectedValue(new Error("no such secret"));

    const { secretInfo } = await import("./secret-info.js");
    await expect(secretInfo("nope", { json: true } as never)).rejects.toThrow(/^json:not_found:/);
  });
});
