import { existsSync, readFileSync } from "node:fs";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";
import { parseJSONFlag } from "../../lib/parse-json-flag.js";

/** A language's content: a flat map of keys to translated strings. */
type LanguageContent = Record<string, string>;

interface ContentOptions {
  json?: boolean;
}

interface AssembleInput {
  /** Path passed to `--file`. */
  file?: string;
  /** Repeatable `--set KEY=value` pairs. */
  set?: string[];
}

interface ContentDiff {
  added: number;
  removed: number;
  changed: number;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Checks that a locale is well-formed (`xx` or `xx-YY`).
 *
 * This is a shape check, not a membership check: rejecting a well-formed locale
 * the API would have accepted is worse than passing an unusual one through. A
 * closed list would need product input.
 */
function assertLocaleShape(locale: string, flagName: string, options: ContentOptions = {}): string {
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(locale)) {
    failWith(`Invalid ${flagName} "${locale}". Expected a locale like "en" or "en-US".`, "invalid_locale", options.json);
  }
  return locale;
}

/** Longest slug the API accepts. Verified against a live profile. */
const SLUG_MAX_LENGTH = 7;

/**
 * @description Checks a dictionary slug against the two rules the API enforces:
 * at most 7 characters, and uppercase alphanumerics only.
 *
 * Neither is in the SDK types or the docs. The API reports them as "String must
 * contain at most 7 character(s)" and "Invalid 'slug' format, it must be a
 * uppercase alphanumeric", both only after the request. Checking offline turns
 * them into actionable messages, reported separately so the caller knows which
 * rule was broken.
 */
function assertSlugShape(slug: string, flagName: string, options: ContentOptions = {}): string {
  if (slug.length > SLUG_MAX_LENGTH) {
    failWith(`Invalid ${flagName} "${slug}": at most ${SLUG_MAX_LENGTH} characters (got ${slug.length}).`, "invalid_slug", options.json);
  }
  if (!/^[A-Z0-9]+$/.test(slug)) {
    failWith(`Invalid ${flagName} "${slug}": uppercase letters and digits only, e.g. PORTAL.`, "invalid_slug", options.json);
  }
  return slug;
}

/**
 * @description Checks that every key in a content map is one the API accepts.
 *
 * The rule is uppercase letters, digits and underscores, at least two
 * characters. It is absent from the SDK types and the docs; the API reports it
 * as "Invalid language 'key' should be an uppercase alphanumeric field (type)"
 * without naming which key broke it. Since a translation file can hold hundreds
 * of entries, checking offline and naming the key is the difference between an
 * actionable error and a hunt.
 */
function assertContentKeys(content: LanguageContent, options: ContentOptions = {}): LanguageContent {
  for (const key of Object.keys(content)) {
    if (!/^[A-Z0-9_]{2,}$/.test(key)) {
      failWith(`Invalid key "${key}": uppercase letters, digits and underscores only, at least 2 characters.`, "invalid_key", options.json);
    }
  }
  return content;
}

/**
 * @description Reads a language file and validates it against `LanguageData`,
 * which the SDK types as `Record<string, string>`.
 *
 * The `existsSync` guard is deliberate: `entity-create.ts` reads a user-supplied
 * path with a bare `readFileSync`, so a wrong path escapes as an unhandled Node
 * ENOENT with a stack trace instead of a CLI error. A translation file is
 * hand-edited and often large, so a bad value reports the key that needs fixing
 * rather than a generic rejection from the API.
 */
function readContentFile(path: string, options: ContentOptions = {}): LanguageContent {
  if (!existsSync(path)) {
    failWith(`File not found: ${path}`, "file_not_found", options.json);
  }

  const raw = readFileSync(path, "utf8");
  const parsed = parseJSONFlag<Record<string, unknown>>(raw, path, "object", options);

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      failWith(`Invalid value for key "${key}" in ${path}: expected a string, got ${value === null ? "null" : typeof value}.`, "invalid_content", options.json);
    }
  }

  return parsed as LanguageContent;
}

/**
 * @description Turns repeatable `--set KEY=value` pairs into a content map,
 * splitting on the first `=` so a translated string may itself contain one.
 */
function parseSetPairs(pairs: string[] | undefined, options: ContentOptions = {}): LanguageContent {
  const content: LanguageContent = {};

  for (const pair of pairs ?? []) {
    const separator = pair.indexOf("=");
    if (separator < 1) {
      failWith(`Invalid --set "${pair}". Expected the form KEY=value.`, "invalid_pair", options.json);
    }
    content[pair.slice(0, separator)] = pair.slice(separator + 1);
  }

  return content;
}

/**
 * @description Builds the content to send from a file, from `--set` pairs, or
 * from both — with the pairs taking precedence, so a one-off correction can be
 * applied on top of a file without editing it.
 */
function assembleContent(input: AssembleInput, options: ContentOptions = {}): LanguageContent {
  const hasFile = Boolean(input.file);
  const hasPairs = Boolean(input.set?.length);

  if (!hasFile && !hasPairs) {
    failWith("No content given. Pass --file, --set, or both.", "missing_content", options.json);
  }

  const fromFile = hasFile ? readContentFile(input.file as string, options) : {};
  const fromPairs = parseSetPairs(input.set, options);

  return assertContentKeys({ ...fromFile, ...fromPairs }, options);
}

/**
 * @description Compares the language's current content with what is about to
 * replace it. Drives the confirmation shown before a replace drops keys.
 *
 * `current` is nullable because the API may return no content for a locale that
 * has never been written, and the SDK types the response as non-null without
 * checking.
 */
function diffContent(current: LanguageContent | null | undefined, incoming: LanguageContent): ContentDiff {
  const existing = current ?? {};
  const existingKeys = Object.keys(existing);
  const incomingKeys = Object.keys(incoming);

  const added = incomingKeys.filter((key) => !(key in existing)).length;
  const removed = existingKeys.filter((key) => !(key in incoming)).length;
  const changed = incomingKeys.filter((key) => key in existing && existing[key] !== incoming[key]).length;

  return { added, removed, changed };
}

export { assembleContent, assertContentKeys, assertLocaleShape, assertSlugShape, diffContent, parseSetPairs, readContentFile };
export type { ContentDiff, ContentOptions, LanguageContent };
