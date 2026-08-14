import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

vi.mock("../../lib/messages.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/messages.js")>();
  return { ...actual, errorHandler: errorHandlerMock, errorHandlerJSON: errorHandlerJSONMock };
});

vi.mock("../../prompt/pick-dictionary-id-from-tagoio.js", () => ({
  pickDictionaryIDFromTagoIO: pickDictionaryIDMock,
}));

const tempDir = mkdtempSync(join(tmpdir(), "dict-lang-"));

function writeTemp(name: string, contents: unknown): string {
  const path = join(tempDir, name);
  writeFileSync(path, JSON.stringify(contents), "utf8");
  return path;
}

describe("dictLang", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickDictionaryIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("mode resolution", () => {
    test("two mode flags together are rejected before any API call", async () => {
      const path = writeTemp("conflict.json", { AA: "1" });

      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang("dic1", "pt-BR", { file: path, delete: true } as never)).rejects.toThrow(/mode_conflict/);

      expect(resourcesInstance.dictionaries.languageEdit).not.toHaveBeenCalled();
      expect(resourcesInstance.dictionaries.languageDelete).not.toHaveBeenCalled();
    });

    test("no mode flag reads", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ AA: "1" });

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { json: true } as never);

      expect(resourcesInstance.dictionaries.languageInfo).toHaveBeenCalled();
      expect(resourcesInstance.dictionaries.languageEdit).not.toHaveBeenCalled();
    });

    test("a malformed locale is rejected before any API call", async () => {
      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang("dic1", "english", {} as never)).rejects.toThrow(/invalid_locale/);

      expect(resourcesInstance.dictionaries.languageInfo).not.toHaveBeenCalled();
    });
  });

  describe("read", () => {
    test("resolves by id through languageInfo", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ HELLO: "Ola" });

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { json: true } as never);

      expect(resourcesInstance.dictionaries.languageInfo).toHaveBeenCalledWith("dic1", "pt-BR", { fallback: false });
      expect(resourcesInstance.dictionaries.languageInfoBySlug).not.toHaveBeenCalled();
    });

    test("--slug routes to languageInfoBySlug", async () => {
      resourcesInstance.dictionaries.languageInfoBySlug.mockResolvedValue({ HELLO: "Ola" });

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("PORTAL", "pt-BR", { slug: true, json: true } as never);

      expect(resourcesInstance.dictionaries.languageInfoBySlug).toHaveBeenCalledWith("PORTAL", "pt-BR", {
        fallback: true,
      });
      expect(resourcesInstance.dictionaries.languageInfo).not.toHaveBeenCalled();
    });

    /**
     * Fallback defaults off on the id route: an export that silently mixes in
     * another language's strings would corrupt the translation on re-import.
     */
    test("--fallback turns fallback on for the id route", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { fallback: true, json: true } as never);

      expect(resourcesInstance.dictionaries.languageInfo).toHaveBeenCalledWith("dic1", "pt-BR", { fallback: true });
    });

    test("--json emits the content map alone, usable as --file input", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ HELLO: "Ola", BYE: "Tchau" });

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { json: true } as never);

      expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ HELLO: "Ola", BYE: "Tchau" });
    });

    /**
     * The SDK types the response as non-null but never checks, so a locale with
     * no content could hand back null and crash any Object.keys() on it.
     */
    test("a null response is handled, not crashed on", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue(null);

      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang("dic1", "pt-BR", { json: true } as never)).resolves.not.toThrow();

      expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({});
    });

    test("human mode writes nothing to stdout", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ HELLO: "Ola" });

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", {} as never);

      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe("write", () => {
    test("--file replaces the language wholesale", async () => {
      const path = writeTemp("full.json", { AA: "1", BB: "2" });
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { file: path, yes: true } as never);

      expect(resourcesInstance.dictionaries.languageEdit).toHaveBeenCalledWith("dic1", "pt-BR", {
        dictionary: { AA: "1", BB: "2" },
        active: true,
      });
    });

    test("--set pairs reach the payload, values containing = survive", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["AA=1", "EQ=a=b"], yes: true } as never);

      expect(resourcesInstance.dictionaries.languageEdit.mock.calls[0][2].dictionary).toEqual({ AA: "1", EQ: "a=b" });
    });

    test("--inactive sends active false", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["AA=1"], inactive: true, yes: true } as never);

      expect(resourcesInstance.dictionaries.languageEdit.mock.calls[0][2].active).toBe(false);
    });

    test("--merge reads the current content and preserves untouched keys", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ KEEP: "kept", OVER: "old" });
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["OVER=new"], merge: true } as never);

      expect(resourcesInstance.dictionaries.languageEdit.mock.calls[0][2].dictionary).toEqual({
        KEEP: "kept",
        OVER: "new",
      });
    });

    test("--merge never prompts, since nothing is lost", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ KEEP: "kept" });
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["NEW=x"], merge: true } as never);

      expect(resourcesInstance.dictionaries.languageEdit).toHaveBeenCalled();
    });

    test("a replace that drops keys confirms first", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ A: "1", B: "2", C: "3" });
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");
      prompts.inject([true]);

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["AA=1"] } as never);

      expect(resourcesInstance.dictionaries.languageEdit).toHaveBeenCalled();
    });

    test("declining the replace makes no call and returns normally", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ AA: "1", BB: "2" });
      prompts.inject([false]);

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["AA=1"] } as never);

      expect(resourcesInstance.dictionaries.languageEdit).not.toHaveBeenCalled();
    });

    test("-y skips the replace confirmation", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({ AA: "1", BB: "2" });
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["AA=1"], yes: true } as never);

      expect(resourcesInstance.dictionaries.languageEdit).toHaveBeenCalled();
    });

    test("a replace on an empty language does not prompt", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");
      // No prompts.inject: a prompt here would hang or resolve undefined and abort.

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["AA=1"] } as never);

      expect(resourcesInstance.dictionaries.languageEdit).toHaveBeenCalled();
    });

    /**
     * A language exists only once `languageEdit` writes to it, and the API
     * rejects a read of one it has never seen with "<locale> can't be found".
     * The first write to any new locale therefore reads a missing one, so the
     * write must not surface that as a failure.
     */
    test("writes to a language that does not exist yet", async () => {
      resourcesInstance.dictionaries.languageInfo.mockRejectedValue(new Error("pt-BR can't be found"));
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["HELLO=Ola"] } as never);

      expect(resourcesInstance.dictionaries.languageEdit).toHaveBeenCalledWith("dic1", "pt-BR", {
        dictionary: { HELLO: "Ola" },
        active: true,
      });
    });

    test("a first write never prompts, since there is nothing to lose", async () => {
      resourcesInstance.dictionaries.languageInfo.mockRejectedValue(new Error("pt-BR can't be found"));
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");
      // No prompts.inject: a prompt here would resolve undefined and abort.

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["HELLO=Ola"] } as never);

      expect(resourcesInstance.dictionaries.languageEdit).toHaveBeenCalled();
    });

    test("--merge against a missing language writes just the incoming keys", async () => {
      resourcesInstance.dictionaries.languageInfo.mockRejectedValue(new Error("pt-BR can't be found"));
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["HELLO=Ola"], merge: true } as never);

      expect(resourcesInstance.dictionaries.languageEdit.mock.calls[0][2].dictionary).toEqual({ HELLO: "Ola" });
    });

    test("no content at all fails before any API call", async () => {
      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang("dic1", "pt-BR", { merge: true } as never)).rejects.toThrow(/missing_content/);
    });

    test("--json reports the written locale", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});
      resourcesInstance.dictionaries.languageEdit.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { set: ["AA=1"], yes: true, json: true } as never);

      expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({
        id: "dic1",
        locale: "pt-BR",
        updated: true,
      });
    });

    test("an API rejection reports write_failed", async () => {
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});
      resourcesInstance.dictionaries.languageEdit.mockRejectedValue(new Error("boom"));

      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang("dic1", "pt-BR", { set: ["AA=1"], yes: true } as never)).rejects.toThrow(/write_failed|boom/);
    });
  });

  describe("delete", () => {
    test("confirming removes the language", async () => {
      resourcesInstance.dictionaries.languageDelete.mockResolvedValue("ok");
      prompts.inject([true]);

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { delete: true } as never);

      expect(resourcesInstance.dictionaries.languageDelete).toHaveBeenCalledWith("dic1", "pt-BR");
    });

    test("declining makes no call and returns normally", async () => {
      prompts.inject([false]);

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { delete: true } as never);

      expect(resourcesInstance.dictionaries.languageDelete).not.toHaveBeenCalled();
    });

    test("-y deletes without prompting", async () => {
      resourcesInstance.dictionaries.languageDelete.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { delete: true, yes: true } as never);

      expect(resourcesInstance.dictionaries.languageDelete).toHaveBeenCalled();
    });

    test("--json reports the deleted locale", async () => {
      resourcesInstance.dictionaries.languageDelete.mockResolvedValue("ok");

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("dic1", "pt-BR", { delete: true, yes: true, json: true } as never);

      expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({
        id: "dic1",
        locale: "pt-BR",
        deleted: true,
      });
    });

    test("an API rejection reports delete_failed", async () => {
      resourcesInstance.dictionaries.languageDelete.mockRejectedValue(new Error("boom"));

      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang("dic1", "pt-BR", { delete: true, yes: true } as never)).rejects.toThrow(/delete_failed|boom/);
    });
  });

  describe("shared", () => {
    test("fails when the environment is missing", async () => {
      getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang("dic1", "pt-BR", {} as never)).rejects.toThrow(/Environment not found/);
    });

    test("uses the picker when no id is given", async () => {
      pickDictionaryIDMock.mockResolvedValue("picked1");
      resourcesInstance.dictionaries.languageInfo.mockResolvedValue({});

      const { dictLang } = await import("./dict-lang.js");
      await dictLang(undefined, "pt-BR", { json: true } as never);

      expect(resourcesInstance.dictionaries.languageInfo).toHaveBeenCalledWith("picked1", "pt-BR", { fallback: false });
    });

    test("--silent without an id fails and never opens the picker", async () => {
      const { dictLang } = await import("./dict-lang.js");
      await expect(dictLang(undefined, "pt-BR", { silent: true } as never)).rejects.toThrow(/missing_input/);

      expect(pickDictionaryIDMock).not.toHaveBeenCalled();
    });

    test("--slug never opens the picker, since the slug is the identifier", async () => {
      resourcesInstance.dictionaries.languageInfoBySlug.mockResolvedValue({});

      const { dictLang } = await import("./dict-lang.js");
      await dictLang("PORTAL", "pt-BR", { slug: true, json: true } as never);

      expect(pickDictionaryIDMock).not.toHaveBeenCalled();
    });
  });
});
