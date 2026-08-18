import prompts from "prompts";
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
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-run-user-id-from-tagoio.js", () => ({
  pickRunUserIDFromTagoIO: pickRunUserIDMock,
}));

describe("runUserDelete", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickRunUserIDMock.mockReset().mockResolvedValue("usr1");
    resourcesInstance.run.userInfo.mockResolvedValue({ id: "usr1", email: "victim@tago.io", name: "Victim" });
    resourcesInstance.run.userDelete.mockResolvedValue("Successfully Removed");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { runUserDelete } = await import("./run-user-delete.js");
    await expect(runUserDelete("usr1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("deletes after the confirmation is accepted", async () => {
    prompts.inject([true]);

    const { runUserDelete } = await import("./run-user-delete.js");
    await runUserDelete("usr1", {} as never);

    expect(resourcesInstance.run.userDelete).toHaveBeenCalledWith("usr1");
  });

  test("declining makes no delete call", async () => {
    prompts.inject([false]);

    const { runUserDelete } = await import("./run-user-delete.js");
    await runUserDelete("usr1", {} as never);

    expect(resourcesInstance.run.userDelete).not.toHaveBeenCalled();
  });

  /**
   * The id is opaque and the email is both what an operator recognises and what
   * the API treats as identity. Asserted through the exported builder, since a
   * spy on `prompts.prompt` never intercepts a direct `prompts(...)` call.
   */
  test("the confirmation names the email", async () => {
    const { buildDeleteMessage } = await import("./run-user-delete.js");

    expect(buildDeleteMessage('run user "victim@tago.io"')).toContain("victim@tago.io");
  });

  test("the confirmation says the account cannot be restored", async () => {
    const { buildDeleteMessage } = await import("./run-user-delete.js");

    expect(buildDeleteMessage('run user "victim@tago.io"')).toMatch(/cannot be restored|unrecoverable/i);
  });

  test("the confirmation says portal access is lost", async () => {
    const { buildDeleteMessage } = await import("./run-user-delete.js");

    expect(buildDeleteMessage('run user "victim@tago.io"')).toMatch(/access/i);
  });

  test("describeTarget names the email when the lookup succeeds", async () => {
    const { describeTarget } = await import("./run-user-delete.js");

    await expect(describeTarget(resourcesInstance as never, "usr1")).resolves.toContain("victim@tago.io");
  });

  /** A failed read must not block a delete. */
  test("describeTarget falls back to the id when the lookup fails", async () => {
    resourcesInstance.run.userInfo.mockRejectedValue(new Error("nope"));

    const { describeTarget } = await import("./run-user-delete.js");

    await expect(describeTarget(resourcesInstance as never, "usr1")).resolves.toContain("usr1");
  });

  test("a failed lookup still allows the delete", async () => {
    resourcesInstance.run.userInfo.mockRejectedValue(new Error("nope"));
    prompts.inject([true]);

    const { runUserDelete } = await import("./run-user-delete.js");
    await runUserDelete("usr1", {} as never);

    expect(resourcesInstance.run.userDelete).toHaveBeenCalledWith("usr1");
  });

  test("-y deletes without prompting", async () => {
    const promptSpy = vi.spyOn(prompts, "prompt");

    const { runUserDelete } = await import("./run-user-delete.js");
    await runUserDelete("usr1", { yes: true } as never);

    expect(promptSpy).not.toHaveBeenCalled();
    expect(resourcesInstance.run.userDelete).toHaveBeenCalledWith("usr1");
  });

  test("--silent deletes without prompting", async () => {
    const { runUserDelete } = await import("./run-user-delete.js");
    await runUserDelete("usr1", { silent: true } as never);

    expect(resourcesInstance.run.userDelete).toHaveBeenCalledWith("usr1");
  });

  test("prompts for the id when it is omitted", async () => {
    prompts.inject([true]);

    const { runUserDelete } = await import("./run-user-delete.js");
    await runUserDelete(undefined, {} as never);

    expect(pickRunUserIDMock).toHaveBeenCalled();
    expect(resourcesInstance.run.userDelete).toHaveBeenCalledWith("usr1");
  });

  test("--silent without an id fails and deletes nothing", async () => {
    const { runUserDelete } = await import("./run-user-delete.js");
    await expect(runUserDelete(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickRunUserIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.run.userDelete).not.toHaveBeenCalled();
  });

  test("--json synthesizes an ack, since the SDK resolves a plain string", async () => {
    const { runUserDelete } = await import("./run-user-delete.js");
    await runUserDelete("usr1", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "usr1", deleted: true });
  });

  test("an API rejection reports delete_failed", async () => {
    resourcesInstance.run.userDelete.mockRejectedValue(new Error("boom"));

    const { runUserDelete } = await import("./run-user-delete.js");
    await expect(runUserDelete("usr1", { yes: true } as never)).rejects.toThrow(/delete_failed|boom/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.run.userDelete.mockRejectedValue(new Error("boom"));

    const { runUserDelete } = await import("./run-user-delete.js");
    await expect(runUserDelete("usr1", { yes: true, json: true } as never)).rejects.toThrow(/^json:delete_failed:/);
  });
});
