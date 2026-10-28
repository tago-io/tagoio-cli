import type { Permissions } from "@tago-io/sdk";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";
import { readJSONFlagSource } from "../../lib/json-flag-source.js";
import { parseJSONFlag } from "../../lib/parse-json-flag.js";

/**
 * A policy target: a triple such as `["analysis","id","<id>"]` or
 * `["run_user","tag_match","organization_id"]`.
 *
 * The SDK declares `targets: []` — an empty-array literal — and carries its own
 * `// TODO: target type` admitting the gap. Probed against a live profile, every
 * target is a three-element array.
 */
type AccessTarget = string[];

interface PayloadOptions {
  permissions?: string;
  permissionsFile?: string;
  targets?: string;
  targetsFile?: string;
  json?: boolean;
}

/** Probed: the API rejects anything else with `Invalid enum value`. */
const EFFECTS = ["allow", "deny"] as const;

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Parses the permission set for a policy.
 *
 * `effect` is checked locally — it is a two-value enum and cannot go stale.
 * `action` and `resource` are **forwarded untouched**: the API's rejection lists
 * all 37 valid actions and 21 valid resources, which is better documentation
 * than the CLI could carry, and a frozen copy would refuse a value the platform
 * adds later. This is a deliberate inversion of the runtime validation in the
 * analysis family, where eight stable values were worth freezing.
 */
function resolvePermissions(options: PayloadOptions): Permissions[] | undefined {
  const source = readJSONFlagSource(options.permissions, options.permissionsFile, "--permissions", options);
  if (!source) {
    return undefined;
  }

  const parsed = parseJSONFlag<unknown[]>(source.raw, source.label, "array", options);

  for (const [index, entry] of parsed.entries()) {
    const at = `permission ${index + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      failWith(`Invalid ${at}: expected an object with effect, action and resource.`, "invalid_permission", options.json);
    }

    const { effect, action, resource } = entry as Record<string, unknown>;

    if (typeof effect !== "string" || !EFFECTS.includes(effect as (typeof EFFECTS)[number])) {
      failWith(`Invalid effect in ${at}: use one of ${EFFECTS.join(", ")}.`, "invalid_effect", options.json);
    }
    if (!Array.isArray(action)) {
      failWith(`Invalid action in ${at}: expected an array of action names.`, "invalid_permission", options.json);
    }
    if (!Array.isArray(resource)) {
      failWith(`Invalid resource in ${at}: expected an array of resource segments.`, "invalid_permission", options.json);
    }
  }

  return parsed as Permissions[];
}

/**
 * @description Parses the target list for a policy.
 *
 * Non-empty is enforced here because the API answers an empty list with
 * `Array must contain at least 1 element(s)` — a caller who passes `[]` meant
 * something, and it is not "no targets".
 */
function resolveTargets(options: PayloadOptions): AccessTarget[] | undefined {
  const source = readJSONFlagSource(options.targets, options.targetsFile, "--targets", options);
  if (!source) {
    return undefined;
  }

  const parsed = parseJSONFlag<unknown[]>(source.raw, source.label, "array", options);

  if (parsed.length === 0) {
    failWith("A policy needs at least one target — the API refuses an empty list.", "empty_targets", options.json);
  }

  for (const [index, entry] of parsed.entries()) {
    if (!Array.isArray(entry)) {
      failWith(`Invalid target ${index + 1}: expected an array such as ["analysis","id","<id>"].`, "invalid_target", options.json);
    }
  }

  return parsed as AccessTarget[];
}

export { resolvePermissions, resolveTargets };
export type { AccessTarget, PayloadOptions };
