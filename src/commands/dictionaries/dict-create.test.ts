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

const validOptions = { slug: "PORTAL", fallback: "en-US" };

describe("dictCreate", () => {
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

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { dictCreate } = await import("./dict-create.js");
    await expect(dictCreate("Portal", validOptions as never)).rejects.toThrow(/Environment not found/);
  });

  test("sends name, slug and fallback", async () => {
    resourcesInstance.dictionaries.create.mockResolvedValue({ dictionary: "dic1" });

    const { dictCreate } = await import("./dict-create.js");
    await dictCreate("Portal Strings", validOptions as never);

    expect(resourcesInstance.dictionaries.create).toHaveBeenCalledWith({
      name: "Portal Strings",
      slug: "PORTAL",
      fallback: "en-US",
    });
  });

  /**
   * The SDK resolves { dictionary: "<id>" } — the third distinct id key in this
   * codebase, after devices' { device_id } and actions' { action }. Reading the
   * wrong one yields undefined ids in --json output.
   */
  test("--json reports the id from response.dictionary", async () => {
    resourcesInstance.dictionaries.create.mockResolvedValue({ dictionary: "dic1" });

    const { dictCreate } = await import("./dict-create.js");
    await dictCreate("Portal Strings", { ...validOptions, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({
      id: "dic1",
      name: "Portal Strings",
      slug: "PORTAL",
    });
  });

  test("--json prefers response.dictionary even when the payload also carries an id", async () => {
    resourcesInstance.dictionaries.create.mockResolvedValue({ dictionary: "dic1", id: "WRONG" });

    const { dictCreate } = await import("./dict-create.js");
    await dictCreate("Portal Strings", { ...validOptions, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).id).toBe("dic1");
  });

  test("--silent without a slug fails before any API call", async () => {
    const { dictCreate } = await import("./dict-create.js");
    await expect(dictCreate("Portal", { fallback: "en-US", silent: true } as never)).rejects.toThrow(/Missing required input/);
    expect(resourcesInstance.dictionaries.create).not.toHaveBeenCalled();
  });

  test("--silent without a fallback fails before any API call", async () => {
    const { dictCreate } = await import("./dict-create.js");
    await expect(dictCreate("Portal", { slug: "PORTAL", silent: true } as never)).rejects.toThrow(/Missing required input/);
    expect(resourcesInstance.dictionaries.create).not.toHaveBeenCalled();
  });

  test.each([["en"], ["en-US"], ["pt-BR"]])("accepts the locale shape %s", async (fallback) => {
    resourcesInstance.dictionaries.create.mockResolvedValue({ dictionary: "dic1" });

    const { dictCreate } = await import("./dict-create.js");
    await dictCreate("Portal", { slug: "PORTAL", fallback } as never);

    expect(resourcesInstance.dictionaries.create.mock.calls[0][0].fallback).toBe(fallback);
  });

  test.each([["english"], ["en_US"], ["EN-us-extra"], ["123"]])("rejects the malformed locale %s before any API call", async (fallback) => {
    const { dictCreate } = await import("./dict-create.js");
    await expect(dictCreate("Portal", { slug: "PORTAL", fallback } as never)).rejects.toThrow(/invalid_locale/);
    expect(resourcesInstance.dictionaries.create).not.toHaveBeenCalled();
  });

  test("an API rejection reports create_failed", async () => {
    resourcesInstance.dictionaries.create.mockRejectedValue(new Error("boom"));

    const { dictCreate } = await import("./dict-create.js");
    await expect(dictCreate("Portal", validOptions as never)).rejects.toThrow(/create_failed|boom/);
  });

  test("an API rejection reports through the JSON channel when --json is set", async () => {
    resourcesInstance.dictionaries.create.mockRejectedValue(new Error("boom"));

    const { dictCreate } = await import("./dict-create.js");
    await expect(dictCreate("Portal", { ...validOptions, json: true } as never)).rejects.toThrow(/^json:create_failed:/);
  });
});
