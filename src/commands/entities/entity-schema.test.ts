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
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-entity-id-from-tagoio.js", () => ({
  pickEntityIDFromTagoIO: vi.fn(),
}));

describe("entitySchema", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("default mode prints schema + indexes from entities.info", async () => {
    resourcesInstance.entities.info.mockResolvedValue({
      id: "ent1",
      schema: { email: { type: "string" } },
      index: { by_email: { fields: ["email"] } },
    });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", {} as never);

    expect(resourcesInstance.entities.info).toHaveBeenCalledWith("ent1");
  });

  test("default mode + --json emits a single object with id/schema/index", async () => {
    resourcesInstance.entities.info.mockResolvedValue({
      id: "ent1",
      schema: { name: { type: "string" } },
      index: {},
    });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", { json: true } as never);

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(JSON.parse(written)).toEqual({ id: "ent1", schema: { name: { type: "string" } }, index: {} });
  });

  test("--add-field calls editSchemaIndex and injects action: 'create'", async () => {
    resourcesInstance.entities.editSchemaIndex.mockResolvedValue({ message: "ok" });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", {
      addField: JSON.stringify({ age: { type: "int" } }),
    } as never);

    expect(resourcesInstance.entities.editSchemaIndex).toHaveBeenCalledWith("ent1", {
      schema: { age: { action: "create", type: "int" } },
    });
  });

  test("--update-field calls updateField with field name + payload", async () => {
    resourcesInstance.entities.updateField.mockResolvedValue({ message: "ok" });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", {
      updateField: JSON.stringify({ age: { type: "integer", required: true } }),
    } as never);

    expect(resourcesInstance.entities.updateField).toHaveBeenCalledWith("ent1", "age", { type: "integer", required: true });
  });

  test("--rename-field parses <from>:<to> and calls renameField", async () => {
    resourcesInstance.entities.renameField.mockResolvedValue({ message: "ok" });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", { renameField: "old:new" } as never);

    expect(resourcesInstance.entities.renameField).toHaveBeenCalledWith("ent1", "old", "new");
  });

  test("--rename-field with malformed spec errors actionably", async () => {
    const { entitySchema } = await import("./entity-schema.js");
    await expect(entitySchema("ent1", { renameField: "nosep", json: true } as never)).rejects.toThrow(/json:--rename-field expects/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("<from>:<to>"), "bad_rename_spec");
  });

  test("--delete-field with --silent calls deleteField directly", async () => {
    resourcesInstance.entities.deleteField.mockResolvedValue({ message: "ok" });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", { deleteField: "age", silent: true } as never);

    expect(resourcesInstance.entities.deleteField).toHaveBeenCalledWith("ent1", "age");
  });

  test("--delete-field without --silent prompts; No cancels", async () => {
    prompts.inject([false]);

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", { deleteField: "age" } as never);

    expect(resourcesInstance.entities.deleteField).not.toHaveBeenCalled();
  });

  test("--add-index calls editSchemaIndex and injects action: 'create'", async () => {
    resourcesInstance.entities.editSchemaIndex.mockResolvedValue({ message: "ok" });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", {
      addIndex: JSON.stringify({ by_age: { fields: ["age"] } }),
    } as never);

    expect(resourcesInstance.entities.editSchemaIndex).toHaveBeenCalledWith("ent1", {
      index: { by_age: { action: "create", fields: ["age"] } },
    });
  });

  test("--delete-index with --silent calls deleteIndex directly", async () => {
    resourcesInstance.entities.deleteIndex.mockResolvedValue({ message: "ok" });

    const { entitySchema } = await import("./entity-schema.js");
    await entitySchema("ent1", { deleteIndex: "by_email", silent: true } as never);

    expect(resourcesInstance.entities.deleteIndex).toHaveBeenCalledWith("ent1", "by_email");
  });

  test("multiple op flags together error with mode_conflict", async () => {
    const { entitySchema } = await import("./entity-schema.js");
    await expect(
      entitySchema("ent1", { addField: "{}", deleteField: "age", json: true } as never),
    ).rejects.toThrow(/json:Only one schema op/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Only one schema op"), "mode_conflict");
  });

  test("--add-field with multiple top-level keys errors with bad_payload", async () => {
    const { entitySchema } = await import("./entity-schema.js");
    await expect(
      entitySchema("ent1", { addField: JSON.stringify({ a: {}, b: {} }), json: true } as never),
    ).rejects.toThrow(/json:--add-field JSON must have exactly one top-level key/);
  });

  test("--silent without id errors with missing_input", async () => {
    const { entitySchema } = await import("./entity-schema.js");
    await expect(entitySchema(undefined, { silent: true } as never)).rejects.toThrow(/Missing required input: id/);
  });
});
