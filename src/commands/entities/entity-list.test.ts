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
  successMSG: vi.fn(),
}));

describe("entityList", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("prints a table on stdout when neither --json nor --stringify is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.list.mockResolvedValue([{ id: "ent1", name: "Entity One", tags: [], updated_at: null }]);

    const { entityList } = await import("./entity-list.js");
    await entityList({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.entities.list).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, fields: ["id", "name", "tags", "created_at", "updated_at"] }),
    );
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("emits compact JSON to stdout when --json is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.list.mockResolvedValue([{ id: "ent1", name: "Entity One", tags: [] }]);

    const { entityList } = await import("./entity-list.js");
    await entityList({ tagkey: [], tagvalue: [], json: true } as never);

    expect(stdoutSpy).toHaveBeenCalled();
    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(() => JSON.parse(written)).not.toThrow();
    expect(written).not.toContain("\n  "); // compact, no indentation
  });

  test("emits pretty JSON when --stringify is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.list.mockResolvedValue([{ id: "ent1", name: "Entity One", tags: [] }]);

    const { entityList } = await import("./entity-list.js");
    await entityList({ tagkey: [], tagvalue: [], stringify: true } as never);

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(() => JSON.parse(written)).not.toThrow();
    expect(written).toContain("\n  "); // pretty-printed
  });

  test("applies name and tag filters to the SDK call", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.list.mockResolvedValue([]);

    const { entityList } = await import("./entity-list.js");
    await entityList({ tagkey: ["env"], tagvalue: ["prod"], name: "users" } as never);

    expect(resourcesInstance.entities.list).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { name: "*users*", tags: [{ key: "env", value: "prod" }] },
      }),
    );
  });

  test("routes a SDK failure through errorHandler with an actionable message", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.list.mockRejectedValue(new Error("Authorization Denied"));

    const { entityList } = await import("./entity-list.js");
    await expect(entityList({ tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Failed to list entities: Authorization Denied/);
    expect(errorHandlerMock).toHaveBeenCalled();
    expect(errorHandlerJSONMock).not.toHaveBeenCalled();
  });

  test("--json + SDK failure routes through errorHandlerJSON", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.entities.list.mockRejectedValue(new Error("boom"));

    const { entityList } = await import("./entity-list.js");
    await expect(entityList({ tagkey: [], tagvalue: [], json: true } as never)).rejects.toThrow(/json:Failed to list entities/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Failed to list entities"), "list_failed");
    expect(errorHandlerMock).not.toHaveBeenCalled();
  });

  test("errors when getEnvironmentConfig returns undefined", async () => {
    getEnvironmentConfigMock.mockReturnValue(undefined);

    const { entityList } = await import("./entity-list.js");
    await expect(entityList({ tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });
});
