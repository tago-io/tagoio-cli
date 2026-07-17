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
// Mirrors the real requireOrFail silent path: missing input routes through the
// JSON/plain error handlers with the "missing_input" code.
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string, opts: { silent?: boolean; json?: boolean } = {}) => {
  if (value) {
    return value;
  }
  const message = `Missing required input: ${name}`;
  if (opts.json) {
    errorHandlerJSONMock(message, "missing_input");
  }
  errorHandlerMock(message);
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
  infoMSG: vi.fn(),
}));

describe("deviceCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates a mutable device with network and connector", async () => {
    resourcesInstance.devices.create.mockResolvedValue({ device_id: "dev-1", token: "tok-1" });

    const { deviceCreate } = await import("./device-create.js");
    await deviceCreate("Sensor A", {
      type: "mutable",
      network: "net-1",
      connector: "con-1",
    } as never);

    expect(resourcesInstance.devices.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sensor A", type: "mutable", network: "net-1", connector: "con-1" }),
    );
  });

  test("immutable without chunk-period/retention errors with validation code", async () => {
    const { deviceCreate } = await import("./device-create.js");
    await expect(
      deviceCreate("Imm", { type: "immutable", network: "net-1", connector: "con-1", json: true } as never),
    ).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("chunk"), "missing_chunk_config");
    expect(resourcesInstance.devices.create).not.toHaveBeenCalled();
  });

  test("immutable with chunk-period and chunk-retention is created", async () => {
    resourcesInstance.devices.create.mockResolvedValue({ device_id: "dev-imm" });

    const { deviceCreate } = await import("./device-create.js");
    await deviceCreate("Imm", {
      type: "immutable",
      network: "net-1",
      connector: "con-1",
      chunkPeriod: "month",
      chunkRetention: 3,
    } as never);

    expect(resourcesInstance.devices.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "immutable", chunk_period: "month", chunk_retention: 3 }),
    );
  });

  test("chunk-retention above the period max errors with validation code, no SDK call", async () => {
    const { deviceCreate } = await import("./device-create.js");
    await expect(
      deviceCreate("Imm", {
        type: "immutable",
        network: "net-1",
        connector: "con-1",
        chunkPeriod: "week",
        chunkRetention: 30,
        json: true,
      } as never),
    ).rejects.toThrow();

    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("chunk-retention"), "invalid_chunk_retention");
    expect(resourcesInstance.devices.create).not.toHaveBeenCalled();
  });

  test("zips tag keys and values by index", async () => {
    resourcesInstance.devices.create.mockResolvedValue({ device_id: "dev-t" });

    const { deviceCreate } = await import("./device-create.js");
    await deviceCreate("Tagged", {
      type: "mutable",
      network: "net-1",
      connector: "con-1",
      tagkey: ["type", "site"],
      tagvalue: ["sensor", "hq"],
    } as never);

    expect(resourcesInstance.devices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [{ key: "type", value: "sensor" }, { key: "site", value: "hq" }],
      }),
    );
  });

  test("--inactive creates the device inactive", async () => {
    resourcesInstance.devices.create.mockResolvedValue({ device_id: "dev-i" });

    const { deviceCreate } = await import("./device-create.js");
    await deviceCreate("Off", {
      type: "mutable",
      network: "net-1",
      connector: "con-1",
      inactive: true,
    } as never);

    expect(resourcesInstance.devices.create).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
  });

  test("--json emits compact {id, name} from device_id", async () => {
    resourcesInstance.devices.create.mockResolvedValue({ device_id: "json-dev", token: "t" });

    const { deviceCreate } = await import("./device-create.js");
    await deviceCreate("JC", {
      type: "mutable",
      network: "net-1",
      connector: "con-1",
      json: true,
    } as never);

    expect(stdoutSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "json-dev", name: "JC", token: "t" });
  });

  test("--silent with missing network errors with missing_input", async () => {
    const { deviceCreate } = await import("./device-create.js");
    await expect(
      deviceCreate("NoNet", { type: "mutable", connector: "con-1", silent: true, json: true } as never),
    ).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("network"), "missing_input");
  });

  test("SDK failure routes through errorHandler", async () => {
    resourcesInstance.devices.create.mockRejectedValue(new Error("boom"));

    const { deviceCreate } = await import("./device-create.js");
    await expect(
      deviceCreate("X", { type: "mutable", network: "net-1", connector: "con-1" } as never),
    ).rejects.toThrow(/Failed to create device: boom/);
  });
});
