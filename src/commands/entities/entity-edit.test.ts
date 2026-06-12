import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, _code?: string) => {
  throw new Error(`json:${message}`);
});
const pickEntityIDFromTagoIOMock = vi.fn();

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
}));

vi.mock("../../prompt/pick-entity-id-from-tagoio.js", () => ({
  pickEntityIDFromTagoIO: pickEntityIDFromTagoIOMock,
}));

describe("entityEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickEntityIDFromTagoIOMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("calls resources.entities.edit with the patch from --name", async () => {
    resourcesInstance.entities.edit.mockResolvedValue({ message: "ok" });

    const { entityEdit } = await import("./entity-edit.js");
    await entityEdit("ent1", { name: "renamed" } as never);

    expect(resourcesInstance.entities.edit).toHaveBeenCalledWith("ent1", { name: "renamed" });
  });

  test("builds the patch from --name", async () => {
    resourcesInstance.entities.edit.mockResolvedValue({ message: "ok" });

    const { entityEdit } = await import("./entity-edit.js");
    await entityEdit("ent1", { name: "renamed" } as never);

    expect(resourcesInstance.entities.edit).toHaveBeenCalledWith("ent1", {
      name: "renamed",
    });
  });

  test("uses the picker when no id is passed and not --silent", async () => {
    pickEntityIDFromTagoIOMock.mockResolvedValue("picked-id");
    resourcesInstance.entities.edit.mockResolvedValue({ message: "ok" });

    const { entityEdit } = await import("./entity-edit.js");
    await entityEdit(undefined, { name: "x" } as never);

    expect(pickEntityIDFromTagoIOMock).toHaveBeenCalled();
    expect(resourcesInstance.entities.edit).toHaveBeenCalledWith("picked-id", { name: "x" });
  });

  test("--silent without an id errors with missing_input", async () => {
    const { entityEdit } = await import("./entity-edit.js");
    await expect(entityEdit(undefined, { silent: true, name: "x" } as never)).rejects.toThrow(/Missing required input: id/);
  });

  test("no-op edit (no --name) errors actionably", async () => {
    const { entityEdit } = await import("./entity-edit.js");
    await expect(entityEdit("ent1", {} as never)).rejects.toThrow(/Nothing to update/);
  });

  test("--json emits {id, ...patch} on stdout", async () => {
    resourcesInstance.entities.edit.mockResolvedValue({ message: "ok" });

    const { entityEdit } = await import("./entity-edit.js");
    await entityEdit("ent1", { name: "j-name", json: true } as never);

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(JSON.parse(written)).toEqual({ id: "ent1", name: "j-name" });
  });

  test("SDK failure routes through errorHandler", async () => {
    resourcesInstance.entities.edit.mockRejectedValue(new Error("Authorization Denied"));

    const { entityEdit } = await import("./entity-edit.js");
    await expect(entityEdit("ent1", { name: "x" } as never)).rejects.toThrow(/Failed to edit entity ent1: Authorization Denied/);
  });

  test("--json + SDK failure routes through errorHandlerJSON", async () => {
    resourcesInstance.entities.edit.mockRejectedValue(new Error("boom"));

    const { entityEdit } = await import("./entity-edit.js");
    await expect(entityEdit("ent1", { name: "x", json: true } as never)).rejects.toThrow(/json:Failed to edit entity/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Failed to edit"), "edit_failed");
  });
});
