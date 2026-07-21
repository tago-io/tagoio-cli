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
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-entity-id-from-tagoio.js", () => ({
  pickEntityIDFromTagoIO: pickEntityIDFromTagoIOMock,
}));

describe("entityInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickEntityIDFromTagoIOMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("emits parseable JSON on stdout when --json is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.info.mockResolvedValue({ id: "ent1", name: "Entity One", schema: {}, created_at: null, updated_at: null });

    const { entityInfo } = await import("./entity-info.js");
    await entityInfo("ent1", { json: true } as never);

    expect(stdoutSpy).toHaveBeenCalled();
    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.id).toBe("ent1");
    expect(parsed.name).toBe("Entity One");
  });

  test("prompts for id when omitted in interactive mode", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickEntityIDFromTagoIOMock.mockResolvedValue("picked-id");
    resourcesInstance.entities.info.mockResolvedValue({ id: "picked-id", name: "Picked", schema: {}, created_at: null, updated_at: null });

    const { entityInfo } = await import("./entity-info.js");
    await entityInfo(undefined, { json: true } as never);

    expect(pickEntityIDFromTagoIOMock).toHaveBeenCalled();
    expect(resourcesInstance.entities.info).toHaveBeenCalledWith("picked-id");
  });

  test("--silent + missing id errors immediately instead of prompting", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());

    const { entityInfo } = await import("./entity-info.js");
    await expect(entityInfo(undefined, { silent: true } as never)).rejects.toThrow(/Missing required input: id/);
    expect(pickEntityIDFromTagoIOMock).not.toHaveBeenCalled();
  });

  test("--silent + --json + missing id errors via JSON helper", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());

    const { entityInfo } = await import("./entity-info.js");
    await expect(entityInfo(undefined, { silent: true, json: true } as never)).rejects.toThrow(/json:Missing required input: id/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith("Missing required input: id", "missing_input");
  });

  test("not-found error routes through errorHandler with actionable context", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.info.mockRejectedValue(new Error("Invalid Entity ID"));

    const { entityInfo } = await import("./entity-info.js");
    await expect(entityInfo("ffffffff", {} as never)).rejects.toThrow(/Entity with id ffffffff not found: Invalid Entity ID/);
  });

  test("renders metadata + schema + indexes via console.table when no --json/--stringify is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    const tableSpy = vi.spyOn(console, "table");
    resourcesInstance.entities.info.mockResolvedValue({
      id: "ent1",
      name: "Entity One",
      schema: { email: { type: "string" } },
      index: { email_idx: { fields: ["email"] } },
      created_at: null,
      updated_at: null,
    });

    const { entityInfo } = await import("./entity-info.js");
    await entityInfo("ent1", {} as never);

    // metadata table + schema table + index table → 3 console.table calls
    expect(tableSpy).toHaveBeenCalledTimes(3);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("skips schema/index sections when those keys are absent on the SDK payload", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    const tableSpy = vi.spyOn(console, "table");
    resourcesInstance.entities.info.mockResolvedValue({
      id: "ent1",
      name: "Entity One",
      created_at: null,
      updated_at: null,
    });

    const { entityInfo } = await import("./entity-info.js");
    await entityInfo("ent1", {} as never);

    // only the metadata table renders
    expect(tableSpy).toHaveBeenCalledTimes(1);
  });

  test("not-found error + --json routes through errorHandlerJSON", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.info.mockRejectedValue(new Error("Invalid"));

    const { entityInfo } = await import("./entity-info.js");
    await expect(entityInfo("ffffffff", { json: true } as never)).rejects.toThrow(/json:Entity with id ffffffff not found/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("not found"), "not_found");
  });
});
