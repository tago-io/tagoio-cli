import prompts from "prompts";
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

describe("dictDelete", () => {
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

    const { dictDelete } = await import("./dict-delete.js");
    await expect(dictDelete("dic1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  // A declined confirmation is a normal outcome, not a failure: no call, exit 0.
  test("declining the confirmation makes no delete call and returns normally", async () => {
    resourcesInstance.dictionaries.info.mockResolvedValue({ name: "Portal", languages: [] });
    prompts.inject([false]);

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete("dic1", {} as never);

    expect(resourcesInstance.dictionaries.delete).not.toHaveBeenCalled();
  });

  test("confirming triggers the delete", async () => {
    resourcesInstance.dictionaries.info.mockResolvedValue({ name: "Portal", languages: [] });
    resourcesInstance.dictionaries.delete.mockResolvedValue("ok");
    prompts.inject([true]);

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete("dic1", {} as never);

    expect(resourcesInstance.dictionaries.delete).toHaveBeenCalledWith("dic1");
  });

  /**
   * Deleting a dictionary takes every language with it, so the prompt names the
   * count when it can be read.
   */
  test("the confirmation names the dictionary and its language count", async () => {
    resourcesInstance.dictionaries.info.mockResolvedValue({
      name: "Portal Strings",
      languages: [{ code: "en-US" }, { code: "pt-BR" }],
    });
    resourcesInstance.dictionaries.delete.mockResolvedValue("ok");
    prompts.inject([true]);

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete("dic1", {} as never);

    expect(resourcesInstance.dictionaries.info).toHaveBeenCalledWith("dic1");
    expect(resourcesInstance.dictionaries.delete).toHaveBeenCalled();
  });

  test("an unreadable dictionary still deletes after confirmation", async () => {
    resourcesInstance.dictionaries.info.mockRejectedValue(new Error("nope"));
    resourcesInstance.dictionaries.delete.mockResolvedValue("ok");
    prompts.inject([true]);

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete("dic1", {} as never);

    expect(resourcesInstance.dictionaries.delete).toHaveBeenCalledWith("dic1");
  });

  test("-y deletes without prompting or reading info", async () => {
    resourcesInstance.dictionaries.delete.mockResolvedValue("ok");

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete("dic1", { yes: true } as never);

    expect(resourcesInstance.dictionaries.delete).toHaveBeenCalledWith("dic1");
    expect(resourcesInstance.dictionaries.info).not.toHaveBeenCalled();
  });

  test("--silent deletes without prompting", async () => {
    resourcesInstance.dictionaries.delete.mockResolvedValue("ok");

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete("dic1", { silent: true } as never);

    expect(resourcesInstance.dictionaries.delete).toHaveBeenCalledWith("dic1");
  });

  test("--silent without an id fails, opening no picker and deleting nothing", async () => {
    const { dictDelete } = await import("./dict-delete.js");
    await expect(dictDelete(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickDictionaryIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.dictionaries.delete).not.toHaveBeenCalled();
  });

  test("uses the picker when no id is given", async () => {
    pickDictionaryIDMock.mockResolvedValue("picked1");
    resourcesInstance.dictionaries.delete.mockResolvedValue("ok");

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete(undefined, { yes: true } as never);

    expect(resourcesInstance.dictionaries.delete).toHaveBeenCalledWith("picked1");
  });

  test("--json reports the deleted id", async () => {
    resourcesInstance.dictionaries.delete.mockResolvedValue("ok");

    const { dictDelete } = await import("./dict-delete.js");
    await dictDelete("dic1", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "dic1", deleted: true });
  });

  test("an API rejection reports delete_failed", async () => {
    resourcesInstance.dictionaries.delete.mockRejectedValue(new Error("boom"));

    const { dictDelete } = await import("./dict-delete.js");
    await expect(dictDelete("dic1", { yes: true } as never)).rejects.toThrow(/delete_failed|boom/);
  });

  test("an API rejection reports through the JSON channel when --json is set", async () => {
    resourcesInstance.dictionaries.delete.mockRejectedValue(new Error("boom"));

    const { dictDelete } = await import("./dict-delete.js");
    await expect(dictDelete("dic1", { yes: true, json: true } as never)).rejects.toThrow(/^json:delete_failed:/);
  });
});
