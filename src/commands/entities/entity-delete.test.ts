import prompts from "prompts";
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

describe("entityDelete", () => {
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

  test("--silent deletes without prompting", async () => {
    resourcesInstance.entities.delete.mockResolvedValue("ok");

    const { entityDelete } = await import("./entity-delete.js");
    await entityDelete("ent1", { silent: true } as never);

    expect(resourcesInstance.entities.delete).toHaveBeenCalledWith("ent1");
  });

  test("interactive: confirm-yes triggers the delete", async () => {
    resourcesInstance.entities.delete.mockResolvedValue("ok");
    prompts.inject([true]);

    const { entityDelete } = await import("./entity-delete.js");
    await entityDelete("ent1", {} as never);

    expect(resourcesInstance.entities.delete).toHaveBeenCalledWith("ent1");
  });

  test("interactive: confirm-no aborts without calling the SDK", async () => {
    prompts.inject([false]);

    const { entityDelete } = await import("./entity-delete.js");
    await entityDelete("ent1", {} as never);

    expect(resourcesInstance.entities.delete).not.toHaveBeenCalled();
  });

  test("--silent without an id errors with missing_input", async () => {
    const { entityDelete } = await import("./entity-delete.js");
    await expect(entityDelete(undefined, { silent: true } as never)).rejects.toThrow(/Missing required input: id/);
  });

  test("uses the picker when no id is passed and not --silent", async () => {
    pickEntityIDFromTagoIOMock.mockResolvedValue("picked-id");
    resourcesInstance.entities.delete.mockResolvedValue("ok");
    prompts.inject([true]);

    const { entityDelete } = await import("./entity-delete.js");
    await entityDelete(undefined, {} as never);

    expect(pickEntityIDFromTagoIOMock).toHaveBeenCalled();
    expect(resourcesInstance.entities.delete).toHaveBeenCalledWith("picked-id");
  });

  test("--json emits {id, deleted: true}", async () => {
    resourcesInstance.entities.delete.mockResolvedValue("ok");

    const { entityDelete } = await import("./entity-delete.js");
    await entityDelete("ent1", { silent: true, json: true } as never);

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(JSON.parse(written)).toEqual({ id: "ent1", deleted: true });
  });

  test("--json + SDK failure routes through errorHandlerJSON", async () => {
    resourcesInstance.entities.delete.mockRejectedValue(new Error("boom"));

    const { entityDelete } = await import("./entity-delete.js");
    await expect(entityDelete("ent1", { silent: true, json: true } as never)).rejects.toThrow(/json:Failed to delete entity/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Failed to delete"), "delete_failed");
  });
});
