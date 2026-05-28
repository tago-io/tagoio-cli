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

describe("entityData", () => {
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

  test("default mode reads with no extra params and prints a table", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValue([{ id: "r1", name: "Alice" }]);

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", {} as never);

    expect(resourcesInstance.entities.getEntityData).toHaveBeenCalledWith("ent1", {});
  });

  test("read mode applies --qty / --skip / --order-by / --order / -q filters", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValue([]);

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", {
      qty: 50,
      skip: 10,
      orderBy: "created_at",
      order: "desc",
      query: ["status=active", "tier=gold"],
    } as never);

    expect(resourcesInstance.entities.getEntityData).toHaveBeenCalledWith("ent1", {
      amount: 50,
      skip: 10,
      order: "created_at,desc",
      filter: { status: "active", tier: "gold" },
    });
  });

  test("--post inserts the parsed JSON payload", async () => {
    resourcesInstance.entities.sendEntityData.mockResolvedValue("ok");

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { post: JSON.stringify({ name: "Bob" }) } as never);

    expect(resourcesInstance.entities.sendEntityData).toHaveBeenCalledWith("ent1", { name: "Bob" });
  });

  test("--edit calls editEntityData", async () => {
    resourcesInstance.entities.editEntityData.mockResolvedValue("ok");

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { edit: JSON.stringify({ id: "r1", name: "Bob" }) } as never);

    expect(resourcesInstance.entities.editEntityData).toHaveBeenCalledWith("ent1", { id: "r1", name: "Bob" });
  });

  test("--delete with JSON array of ids and --silent runs without prompting", async () => {
    resourcesInstance.entities.deleteEntityData.mockResolvedValue("ok");

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { delete: JSON.stringify(["r1", "r2"]), silent: true } as never);

    expect(resourcesInstance.entities.deleteEntityData).toHaveBeenCalledWith("ent1", { ids: ["r1", "r2"] });
  });

  test("--delete with comma-separated ids works the same way", async () => {
    resourcesInstance.entities.deleteEntityData.mockResolvedValue("ok");

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { delete: "r1, r2 ,r3", silent: true } as never);

    expect(resourcesInstance.entities.deleteEntityData).toHaveBeenCalledWith("ent1", { ids: ["r1", "r2", "r3"] });
  });

  test("--delete without --silent prompts and cancels on No", async () => {
    prompts.inject([false]);

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { delete: "r1" } as never);

    expect(resourcesInstance.entities.deleteEntityData).not.toHaveBeenCalled();
  });

  test("--empty + --silent calls emptyEntityData", async () => {
    resourcesInstance.entities.emptyEntityData.mockResolvedValue("ok");

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { empty: true, silent: true } as never);

    expect(resourcesInstance.entities.emptyEntityData).toHaveBeenCalledWith("ent1");
  });

  test("--count prints the bare scalar (length of getEntityData)", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValue(
      new Array(42).fill(0).map((_, i) => ({ id: `r${i}` })),
    );

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { count: true } as never);

    expect(stdoutSpy).toHaveBeenCalledWith("42\n");
  });

  test("--count + --json wraps the count in a {id, count} object", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValue([{ id: "r1" }, { id: "r2" }, { id: "r3" }]);

    const { entityData } = await import("./entity-data.js");
    await entityData("ent1", { count: true, json: true } as never);

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(JSON.parse(written)).toEqual({ id: "ent1", count: 3 });
  });

  test("multiple op flags together error with mode_conflict", async () => {
    const { entityData } = await import("./entity-data.js");
    await expect(
      entityData("ent1", { post: "{}", empty: true, json: true } as never),
    ).rejects.toThrow(/json:Only one of/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Only one of"), "mode_conflict");
  });

  test("--delete with no ids errors actionably", async () => {
    const { entityData } = await import("./entity-data.js");
    await expect(entityData("ent1", { delete: " , ", silent: true } as never)).rejects.toThrow(/at least one record id/);
  });

  test("malformed --post JSON errors with json_parse_failed", async () => {
    const { entityData } = await import("./entity-data.js");
    await expect(entityData("ent1", { post: "{not json", json: true } as never)).rejects.toThrow(/json:Failed to parse --post/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Failed to parse"), "json_parse_failed");
  });

  test("--silent without id errors with missing_input", async () => {
    const { entityData } = await import("./entity-data.js");
    await expect(entityData(undefined, { silent: true } as never)).rejects.toThrow(/Missing required input: id/);
  });

  test("read mode SDK failure routes through errorHandler", async () => {
    resourcesInstance.entities.getEntityData.mockRejectedValue(new Error("boom"));

    const { entityData } = await import("./entity-data.js");
    await expect(entityData("ent1", {} as never)).rejects.toThrow(/Failed to read entity ent1 data: boom/);
  });
});
