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
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string) => {
  if (value) {
    return value;
  }
  throw new Error(`requireOrFail missing: ${name}`);
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
  requireOrFail: requireOrFailMock,
  successMSG: vi.fn(),
}));

describe("entityCopy", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    requireOrFailMock.mockImplementation(async (value: string | undefined, name: string) => {
      if (value) {
        return value;
      }
      throw new Error(`requireOrFail missing: ${name}`);
    });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("copies a single page and strips server-managed fields (id, created_at, updated_at)", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValueOnce([
      { id: "r1", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", name: "Alice" },
      { id: "r2", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", name: "Bob" },
    ]);
    resourcesInstance.entities.sendEntityData.mockResolvedValue("ok");

    const { entityCopy } = await import("./entity-copy.js");
    await entityCopy({ from: "src", to: "dst", qty: 100, silent: true } as never);

    expect(resourcesInstance.entities.sendEntityData).toHaveBeenCalledTimes(1);
    expect(resourcesInstance.entities.sendEntityData).toHaveBeenCalledWith("dst", [
      { name: "Alice" },
      { name: "Bob" },
    ]);
  });

  test("pages through the source until a short batch ends the loop", async () => {
    // First two pages full (qty=2), third page short (1 row) → stops.
    resourcesInstance.entities.getEntityData
      .mockResolvedValueOnce([{ id: "r1", v: 1 }, { id: "r2", v: 2 }])
      .mockResolvedValueOnce([{ id: "r3", v: 3 }, { id: "r4", v: 4 }])
      .mockResolvedValueOnce([{ id: "r5", v: 5 }]);
    resourcesInstance.entities.sendEntityData.mockResolvedValue("ok");

    const { entityCopy } = await import("./entity-copy.js");
    await entityCopy({ from: "src", to: "dst", qty: 2, silent: true } as never);

    expect(resourcesInstance.entities.getEntityData).toHaveBeenCalledTimes(3);
    expect(resourcesInstance.entities.sendEntityData).toHaveBeenCalledTimes(3);
  });

  test("empty source: zero pages, summary still prints", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValueOnce([]);

    const { entityCopy } = await import("./entity-copy.js");
    await entityCopy({ from: "src", to: "dst", silent: true } as never);

    expect(resourcesInstance.entities.sendEntityData).not.toHaveBeenCalled();
  });

  test("--json emits {from, to, copied} on stdout", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValueOnce([{ id: "r1", v: 1 }]);
    resourcesInstance.entities.sendEntityData.mockResolvedValue("ok");

    const { entityCopy } = await import("./entity-copy.js");
    await entityCopy({ from: "src", to: "dst", qty: 10, silent: true, json: true } as never);

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(JSON.parse(written)).toEqual({ from: "src", to: "dst", copied: 1 });
  });

  test("--from === --to errors with self_copy", async () => {
    const { entityCopy } = await import("./entity-copy.js");
    await expect(
      entityCopy({ from: "same", to: "same", silent: true, json: true } as never),
    ).rejects.toThrow(/json:--from and --to refer to the same entity/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("same entity"), "self_copy");
  });

  test("source read failure routes through errorHandler", async () => {
    resourcesInstance.entities.getEntityData.mockRejectedValue(new Error("Authorization Denied"));

    const { entityCopy } = await import("./entity-copy.js");
    await expect(
      entityCopy({ from: "src", to: "dst", silent: true } as never),
    ).rejects.toThrow(/Failed to read source entity src: Authorization Denied/);
  });

  test("target write failure routes through errorHandlerJSON with --json", async () => {
    resourcesInstance.entities.getEntityData.mockResolvedValueOnce([{ id: "r1", v: 1 }]);
    resourcesInstance.entities.sendEntityData.mockRejectedValue(new Error("schema mismatch"));

    const { entityCopy } = await import("./entity-copy.js");
    await expect(
      entityCopy({ from: "src", to: "dst", silent: true, json: true } as never),
    ).rejects.toThrow(/json:Failed to write to target entity dst/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("schema mismatch"), "write_failed");
  });

  test("missing --from under --silent errors via requireOrFail", async () => {
    requireOrFailMock.mockImplementationOnce(async () => {
      throw new Error("Missing required input: from");
    });

    const { entityCopy } = await import("./entity-copy.js");
    await expect(entityCopy({ to: "dst", silent: true } as never)).rejects.toThrow(/Missing required input: from/);
  });
});
