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
const pickDictionaryIDMock = vi.fn();

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

vi.mock("../../prompt/pick-dictionary-id-from-tagoio.js", () => ({
  pickDictionaryIDFromTagoIO: pickDictionaryIDMock,
}));

describe("dictEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickDictionaryIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { dictEdit } = await import("./dict-edit.js");
    await expect(dictEdit("dic1", { name: "X" } as never)).rejects.toThrow(/Environment not found/);
  });

  test("an empty patch is rejected without touching the API", async () => {
    const { dictEdit } = await import("./dict-edit.js");
    await expect(dictEdit("dic1", {} as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.dictionaries.edit).not.toHaveBeenCalled();
  });

  test("--name sends only the name", async () => {
    resourcesInstance.dictionaries.edit.mockResolvedValue("ok");

    const { dictEdit } = await import("./dict-edit.js");
    await dictEdit("dic1", { name: "Renamed" } as never);

    expect(resourcesInstance.dictionaries.edit).toHaveBeenCalledWith("dic1", { name: "Renamed" });
  });

  test("--slug and --fallback reach the patch together", async () => {
    resourcesInstance.dictionaries.edit.mockResolvedValue("ok");

    const { dictEdit } = await import("./dict-edit.js");
    await dictEdit("dic1", { slug: "NEW", fallback: "pt-BR" } as never);

    expect(resourcesInstance.dictionaries.edit).toHaveBeenCalledWith("dic1", { slug: "NEW", fallback: "pt-BR" });
  });

  test("a malformed --fallback is rejected before any API call", async () => {
    const { dictEdit } = await import("./dict-edit.js");
    await expect(dictEdit("dic1", { fallback: "english" } as never)).rejects.toThrow(/invalid_locale/);

    expect(resourcesInstance.dictionaries.edit).not.toHaveBeenCalled();
  });

  test("uses the picker when no id is given", async () => {
    pickDictionaryIDMock.mockResolvedValue("picked1");
    resourcesInstance.dictionaries.edit.mockResolvedValue("ok");

    const { dictEdit } = await import("./dict-edit.js");
    await dictEdit(undefined, { name: "X" } as never);

    expect(resourcesInstance.dictionaries.edit).toHaveBeenCalledWith("picked1", { name: "X" });
  });

  test("--silent without an id fails and never opens the picker", async () => {
    const { dictEdit } = await import("./dict-edit.js");
    await expect(dictEdit(undefined, { name: "X", silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickDictionaryIDMock).not.toHaveBeenCalled();
  });

  test("--json reports the updated id", async () => {
    resourcesInstance.dictionaries.edit.mockResolvedValue("ok");

    const { dictEdit } = await import("./dict-edit.js");
    await dictEdit("dic1", { name: "X", json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "dic1", updated: true });
  });

  test("an API rejection reports edit_failed", async () => {
    resourcesInstance.dictionaries.edit.mockRejectedValue(new Error("boom"));

    const { dictEdit } = await import("./dict-edit.js");
    await expect(dictEdit("dic1", { name: "X" } as never)).rejects.toThrow(/edit_failed|boom/);
  });
});
