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

/** Recognisable string used to prove no code path prints the password. */
const SENTINEL = "SENTINEL_PASSWORD_12345";

describe("runUserEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickRunUserIDMock.mockReset().mockResolvedValue("usr1");
    resourcesInstance.run.userEdit.mockResolvedValue("TagoIO Run User Successfully Updated");
    resourcesInstance.run.userInfo.mockResolvedValue({
      id: "usr1",
      email: "old@tago.io",
      name: "Old Name",
      tags: [{ key: "access", value: "admin" }],
    });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit("usr1", { name: "New", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("prompts for the id when it is omitted", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit(undefined, { name: "New", tagkey: [], tagvalue: [] } as never);

    expect(pickRunUserIDMock).toHaveBeenCalled();
    expect(resourcesInstance.run.userEdit).toHaveBeenCalledWith("usr1", expect.objectContaining({ name: "New" }));
  });

  test("--silent without an id fails and never prompts", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit(undefined, { name: "New", silent: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/missing_input/);

    expect(pickRunUserIDMock).not.toHaveBeenCalled();
  });

  test("each field patch reaches the payload without dragging others", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { company: "Tago", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1]).toEqual({ company: "Tago" });
  });

  test("several field patches combine", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", {
      name: "New",
      phone: "+551199",
      language: "pt",
      timezone: "UTC",
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1]).toMatchObject({
      name: "New",
      phone: "+551199",
      language: "pt",
      timezone: "UTC",
    });
  });

  test("--activate sets active true", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { activate: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1].active).toBe(true);
  });

  test("--deactivate sets active false", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { deactivate: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1].active).toBe(false);
  });

  test("--activate and --deactivate together fail before any call", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit("usr1", { activate: true, deactivate: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.run.userEdit).not.toHaveBeenCalled();
  });

  /**
   * `userEdit` takes `Partial<UserInfo>`, and `UserInfo extends
   * Omit<UserCreateInfo,"password">` — so the type has no `password` key. The
   * runtime accepts one anyway: probed against a live profile, which returned
   * success and changed the password. This test pins that the cast still puts it
   * in the payload.
   */
  test("--reset-password puts the typed password in the payload", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { resetPassword: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1].password).toBe(SENTINEL);
  });

  test("--reset-password with --silent fails, since the password can only be typed", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit("usr1", { resetPassword: true, silent: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/missing_input/);

    expect(resourcesInstance.run.userEdit).not.toHaveBeenCalled();
  });

  /** Everything except a password reset works without a terminal. */
  test("a tag-only edit succeeds under --silent", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { silent: true, tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1].tags).toEqual([{ key: "env", value: "prod" }]);
  });

  test("a mismatched confirmation aborts with no API call", async () => {
    prompts.inject([SENTINEL, "different_pass"]);

    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit("usr1", { resetPassword: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/password_mismatch/);

    expect(resourcesInstance.run.userEdit).not.toHaveBeenCalled();
  });

  /**
   * Probed users carry `access=admin`, `organization_id` and `visualize_user`.
   * A replace silently drops authorization data, so the merge path has to work.
   */
  test("--merge-tags preserves tags absent from the command line", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { mergeTags: true, tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1].tags).toEqual([
      { key: "access", value: "admin" },
      { key: "env", value: "prod" },
    ]);
  });

  test("without --merge-tags the tag set is replaced and userInfo is not called", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.run.userEdit.mock.calls[0][1].tags).toEqual([{ key: "env", value: "prod" }]);
    expect(resourcesInstance.run.userInfo).not.toHaveBeenCalled();
  });

  test("an empty patch fails without a request", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit("usr1", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.run.userEdit).not.toHaveBeenCalled();
  });

  test("--json synthesizes an ack, since the SDK resolves a plain string", async () => {
    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { name: "New", json: true, tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "usr1", updated: true });
  });

  test("the password never reaches either stream on the reset path", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserEdit } = await import("./run-user-edit.js");
    await runUserEdit("usr1", { resetPassword: true, json: true, tagkey: [], tagvalue: [] } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("a rejected edit does not echo the password in its error", async () => {
    resourcesInstance.run.userEdit.mockRejectedValue(new Error("boom"));
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit("usr1", { resetPassword: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/edit_failed|boom/);

    const reported = errorHandlerMock.mock.calls.map((call) => String(call[0])).join("");
    expect(reported).not.toContain(SENTINEL);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.run.userEdit.mockRejectedValue(new Error("boom"));

    const { runUserEdit } = await import("./run-user-edit.js");
    await expect(runUserEdit("usr1", { name: "New", json: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/^json:edit_failed:/);
  });
});
