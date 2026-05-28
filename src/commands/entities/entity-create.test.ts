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
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string) => {
  if (value) {
    return value;
  }
  throw new Error(`requireOrFail missing: ${name}`);
});
const readFileSyncMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
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

describe("entityCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    readFileSyncMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("--schema and --schema-json together is an error", async () => {
    const { entityCreate } = await import("./entity-create.js");
    await expect(
      entityCreate(undefined, { schema: "x.json", schemaJson: "{}" } as never),
    ).rejects.toThrow(/mutually exclusive/);
  });

  test("--schema-json short-circuits prompts and creates the entity", async () => {
    resourcesInstance.entities.create.mockResolvedValue({ id: "new-id" });

    const inline = JSON.stringify({ name: "users", schema: { email: { type: "string", required: true } } });

    const { entityCreate } = await import("./entity-create.js");
    await entityCreate(undefined, { schemaJson: inline } as never);

    expect(resourcesInstance.entities.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "users", schema: { email: { type: "string", required: true } } }),
    );
    expect(requireOrFailMock).not.toHaveBeenCalled();
  });

  test("--schema <file> reads from disk and short-circuits prompts", async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ name: "from-file" }));
    resourcesInstance.entities.create.mockResolvedValue({ id: "id-1" });

    const { entityCreate } = await import("./entity-create.js");
    await entityCreate(undefined, { schema: "/tmp/spec.json" } as never);

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/spec.json", "utf8");
    expect(resourcesInstance.entities.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "from-file" }),
    );
  });

  test("interactive path uses prompts for description / tags / schema-paste", async () => {
    requireOrFailMock.mockResolvedValue("interactive-entity");
    resourcesInstance.entities.create.mockResolvedValue({ id: "id-2" });
    prompts.inject([
      "An optional description",                                  // description
      "env:prod,team:platform",                                   // tags
      JSON.stringify({ email: { type: "string", required: true } }), // schema paste
    ]);

    const { entityCreate } = await import("./entity-create.js");
    await entityCreate(undefined, {} as never);

    expect(requireOrFailMock).toHaveBeenCalled();
    expect(resourcesInstance.entities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "interactive-entity",
        tags: [{ key: "env", value: "prod" }, { key: "team", value: "platform" }],
        schema: { email: { type: "string", required: true } },
      }),
    );
  });

  test("--json emits a compact {id, name} on stdout instead of [OK]", async () => {
    resourcesInstance.entities.create.mockResolvedValue({ id: "json-id" });

    const { entityCreate } = await import("./entity-create.js");
    await entityCreate(undefined, { schemaJson: JSON.stringify({ name: "jc" }), json: true } as never);

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(JSON.parse(written)).toEqual({ id: "json-id", name: "jc" });
  });

  test("missing name in --schema-json payload errors actionably", async () => {
    const { entityCreate } = await import("./entity-create.js");
    await expect(
      entityCreate(undefined, { schemaJson: JSON.stringify({ schema: {} }) } as never),
    ).rejects.toThrow(/missing required field: name/);
  });

  test("bare schema map (no envelope) is wrapped as { schema }", async () => {
    // Without this wrapping, the SDK silently drops top-level keys it does not
    // recognise (every schema column), producing an entity with no user fields.
    resourcesInstance.entities.create.mockResolvedValue({ id: "id-bare" });

    const bare = JSON.stringify({ email: { type: "string", required: true }, tier: { type: "string" } });

    const { entityCreate } = await import("./entity-create.js");
    await entityCreate("bare-name", { schemaJson: bare } as never);

    expect(resourcesInstance.entities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "bare-name",
        schema: { email: { type: "string", required: true }, tier: { type: "string" } },
      }),
    );
  });

  test("SDK failure routes through errorHandler", async () => {
    resourcesInstance.entities.create.mockRejectedValue(new Error("boom"));

    const { entityCreate } = await import("./entity-create.js");
    await expect(
      entityCreate(undefined, { schemaJson: JSON.stringify({ name: "x" }) } as never),
    ).rejects.toThrow(/Failed to create entity: boom/);
  });

  test("--json + SDK failure routes through errorHandlerJSON", async () => {
    resourcesInstance.entities.create.mockRejectedValue(new Error("boom"));

    const { entityCreate } = await import("./entity-create.js");
    await expect(
      entityCreate(undefined, { schemaJson: JSON.stringify({ name: "x" }), json: true } as never),
    ).rejects.toThrow(/json:Failed to create entity/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Failed to create entity"), "create_failed");
  });

  test("malformed inline schema JSON errors with schema_parse_failed", async () => {
    const { entityCreate } = await import("./entity-create.js");
    await expect(
      entityCreate(undefined, { schemaJson: "{not json", json: true } as never),
    ).rejects.toThrow(/json:Failed to parse entity schema/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("Failed to parse"), "schema_parse_failed");
  });
});
