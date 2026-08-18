import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG, writeStatus } from "../../lib/messages.js";
import { pickDictionaryIDFromTagoIO } from "../../prompt/pick-dictionary-id-from-tagoio.js";
import { assembleContent, assertLocaleShape, diffContent, type LanguageContent } from "./language-content.js";

interface IOptions {
  environment?: string;
  slug?: boolean;
  fallback?: boolean;
  file?: string;
  set?: string[];
  merge?: boolean;
  inactive?: boolean;
  delete?: boolean;
  yes?: boolean;
  silent?: boolean;
  json?: boolean;
  stringify?: boolean;
}

type Mode = "read" | "write" | "delete";

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Resolves the operation from the mutually-exclusive mode flags,
 * mirroring `entity-data`. Defaults to `read` when none is set.
 */
function resolveMode(options: IOptions): Mode {
  const set: Mode[] = [];
  // --merge and --inactive only make sense while writing, so they select the
  // write mode too. Without that, `--merge` alone would silently read instead,
  // and the missing content would go unreported.
  if (options.file !== undefined || options.set?.length || options.merge || options.inactive) {
    set.push("write");
  }
  if (options.delete === true) {
    set.push("delete");
  }

  if (set.length > 1) {
    failWith(`Only one of --file/--set or --delete may be passed at a time (got: ${set.join(", ")}).`, "mode_conflict", options.json);
  }
  return set[0] ?? "read";
}

async function confirmDestructive(message: string, options: IOptions): Promise<boolean> {
  if (options.yes || options.silent) {
    return true;
  }
  const { confirm } = await prompts({ type: "confirm", name: "confirm", message, initial: false });
  return confirm === true;
}

/**
 * @description Reads a language's current content, treating an absent language
 * as empty rather than as a failure.
 *
 * The API rejects a locale it has never seen with "<locale> can't be found",
 * and a language only comes into existence when `languageEdit` first writes to
 * it. So the first write to any new locale necessarily reads a missing one:
 * swallowing that is what lets `--merge` and the replace diff work on a
 * language that does not exist yet.
 *
 * The nullish fallback also covers the SDK typing the response as non-null
 * without ever checking what the API actually sent.
 */
async function readCurrentContent(resources: Resources, id: string, locale: string): Promise<LanguageContent> {
  const current = await resources.dictionaries.languageInfo(id, locale, { fallback: false }).catch(() => null);
  return (current as LanguageContent | null) ?? {};
}

async function dictLang(idArg: string | undefined, locale: string, options: IOptions) {
  const mode = resolveMode(options);

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  assertLocaleShape(locale, "locale", options);

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // With --slug the first argument is the identifier itself, so the picker
  // never applies.
  let id = idArg;
  if (!id && !options.slug) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickDictionaryIDFromTagoIO(resources);
  }
  const target = id as string;

  if (mode === "read") {
    const content = options.slug
      ? // The SDK coerces `fallback: false` to true on this route, so the flag is
        // passed as-is and the caveat is documented in --help.
        await resources.dictionaries.languageInfoBySlug(target, locale, { fallback: true }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          failWith(`Failed to read ${locale} from ${target}: ${message}`, "read_failed", options.json);
        })
      : await resources.dictionaries.languageInfo(target, locale, { fallback: Boolean(options.fallback) }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          failWith(`Failed to read ${locale} from ${target}: ${message}`, "read_failed", options.json);
        });

    const payload = (content as LanguageContent | null) ?? {};

    if (options.stringify) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }

    // Human view goes to stderr; stdout stays reserved for --json.
    const keys = Object.keys(payload);
    infoMSG(`${locale} on ${target}: ${keys.length} key(s).`);
    for (const key of keys) {
      writeStatus(`  ${key}  ${payload[key]}`);
    }
    return;
  }

  if (mode === "delete") {
    const ok = await confirmDestructive(`Permanently delete language ${locale} from ${target}?`, options);
    if (!ok) {
      successMSG("Cancelled. No changes made.");
      return;
    }

    await resources.dictionaries.languageDelete(target, locale).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Failed to delete ${locale} from ${target}: ${message}`, "delete_failed", options.json);
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify({ id: target, locale, deleted: true })}\n`);
      return;
    }
    successMSG(`Language ${locale} deleted from ${target}.`);
    return;
  }

  // write
  const incoming = assembleContent({ file: options.file, set: options.set }, options);
  const current = await readCurrentContent(resources, target, locale);
  const content = options.merge ? { ...current, ...incoming } : incoming;

  // A replace drops every key the payload omits. Confirm when that would lose
  // something — a `--set ONE_KEY=x` without --merge would otherwise silently
  // wipe the language.
  if (!options.merge) {
    const diff = diffContent(current, content);
    if (diff.removed > 0) {
      const ok = await confirmDestructive(`Replacing ${locale} on ${target}: ${diff.added} key(s) added, ${diff.removed} removed. Continue?`, options);
      if (!ok) {
        successMSG("Cancelled. No changes made.");
        return;
      }
    }
  }

  await resources.dictionaries.languageEdit(target, locale, { dictionary: content, active: !options.inactive }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to write ${locale} on ${target}: ${message}`, "write_failed", options.json);
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: target, locale, updated: true, keys: Object.keys(content).length })}\n`);
    return;
  }
  successMSG(`Language ${locale} updated on ${target} (${Object.keys(content).length} key(s)).`);
}

export { dictLang, resolveMode };
