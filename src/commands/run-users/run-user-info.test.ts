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
const pickRunUserIDMock = vi.fn();

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
  infoMSG: vi.fn(),
  writeStatus: vi.fn(),
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-run-user-id-from-tagoio.js", () => ({
  pickRunUserIDFromTagoIO: pickRunUserIDMock,
}));

describe("runUserInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const userInfo = {
    id: "usr1",
    profile: "prof1",
    name: "Mateus Silva",
    email: "mateus.silva@tago.io",
    active: true,
    newsletter: false,
    phone: "",
    company: "",
    timezone: "America/Sao_Paulo",
    language: "en",
    tags: [{ key: "access", value: "admin" }],
    last_login: new Date("2026-08-06T20:46:40.238Z"),
    created_at: new Date("2026-07-01T13:21:48.402Z"),
    updated_at: new Date("2026-08-07T18:58:19.001Z"),
    options: {},
    // Returned by the API but absent from the `UserInfo` type — probed.
    otp: {},
    custom_preferences: null,
    agreements: null,
  };

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickRunUserIDMock.mockReset().mockResolvedValue("usr1");
    resourcesInstance.run.userInfo.mockResolvedValue(userInfo);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { runUserInfo } = await import("./run-user-info.js");
    await expect(runUserInfo("usr1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("fetches the user by the given id", async () => {
    const { runUserInfo } = await import("./run-user-info.js");
    await runUserInfo("usr1", {} as never);

    expect(resourcesInstance.run.userInfo).toHaveBeenCalledWith("usr1");
  });

  test("prompts for the id when it is omitted", async () => {
    const { runUserInfo } = await import("./run-user-info.js");
    await runUserInfo(undefined, {} as never);

    expect(pickRunUserIDMock).toHaveBeenCalled();
    expect(resourcesInstance.run.userInfo).toHaveBeenCalledWith("usr1");
  });

  test("--silent without an id fails and never prompts", async () => {
    const { runUserInfo } = await import("./run-user-info.js");
    await expect(runUserInfo(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickRunUserIDMock).not.toHaveBeenCalled();
  });

  test("--json emits the record on stdout", async () => {
    const { runUserInfo } = await import("./run-user-info.js");
    await runUserInfo("usr1", { json: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toMatchObject({ id: "usr1", email: "mateus.silva@tago.io", active: true });
  });

  /**
   * `console.table` writes to stdout, which is reserved for machine-readable
   * output. Asserted with the real `console.table` in place — mocking it is what
   * would hide the leak this test exists to catch.
   */
  test("the human view writes nothing to stdout", async () => {
    const { runUserInfo } = await import("./run-user-info.js");
    await runUserInfo("usr1", {} as never);

    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("a null last_login renders as never", async () => {
    resourcesInstance.run.userInfo.mockResolvedValue({ ...userInfo, last_login: null });

    const { runUserInfo } = await import("./run-user-info.js");
    await runUserInfo("usr1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).last_login).toBe("never");
  });

  /**
   * Probed: `userInfo` returns `otp`, `custom_preferences` and `agreements`,
   * none of them in the `UserInfo` type. `--raw` is the documented escape hatch
   * for exactly that, so it must not drop them.
   */
  test("--raw passes through fields the SDK type does not declare", async () => {
    const { runUserInfo } = await import("./run-user-info.js");
    await runUserInfo("usr1", { json: true, raw: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toHaveProperty("otp");
    expect(parsed).toHaveProperty("agreements");
  });

  test("an unknown id reports not_found", async () => {
    resourcesInstance.run.userInfo.mockRejectedValue(new Error("User not found"));

    const { runUserInfo } = await import("./run-user-info.js");
    await expect(runUserInfo("nope", {} as never)).rejects.toThrow(/not_found/);
  });

  test("an unknown id routes through the JSON channel when --json is set", async () => {
    resourcesInstance.run.userInfo.mockRejectedValue(new Error("User not found"));

    const { runUserInfo } = await import("./run-user-info.js");
    await expect(runUserInfo("nope", { json: true } as never)).rejects.toThrow(/^json:not_found:/);
  });
});
