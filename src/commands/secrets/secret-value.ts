import prompts from "prompts";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

/** Shortest value the API accepts. Verified against a live profile. */
const MIN_VALUE_LENGTH = 6;

interface ValueOptions {
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Builds the prompt config. Exported so the prompt *type* is
 * assertable without driving the prompt itself — masking is the whole reason
 * this module exists, so it is worth a test of its own.
 */
function buildValuePrompt(message: string) {
  return { type: "password" as const, name: "value" as const, message };
}

/**
 * @description Resolves the value for a secret. There is exactly one input: a
 * masked prompt.
 *
 * No flag carries the value. An argument-passed credential is written to shell
 * history, visible to any user running `ps` during execution, and captured by
 * CI logs — none of which apply to a value typed at a masked prompt.
 *
 * `requireOrFail` is not reusable here: it is hardcoded to `type: "text"`
 * (`messages.ts:82`) and would echo the credential as it is typed.
 *
 * The consequence is deliberate and worth stating at the call site: with no
 * non-interactive input, `secret-create` and `secret-edit` cannot run under
 * `--silent`. The failure says so rather than leaving the caller to guess.
 */
async function resolveSecretValue(options: ValueOptions, message: string = "Secret value:"): Promise<string> {
  if (options.silent) {
    failWith("A secret value can only be typed at an interactive prompt, so this command cannot run with --silent.", "missing_input", options.json);
  }

  const { value } = await prompts(buildValuePrompt(message));

  // prompts reports a cancelled prompt (Ctrl+C, Esc) as an absent key, which is
  // indistinguishable from an empty submission. Both must fail: storing an
  // empty secret would look like a successful rotation.
  if (!value) {
    failWith("No value given. A secret cannot be empty.", "empty_value", options.json);
  }

  // The API refuses anything shorter, and reports it only as "Sorry, Internal
  // Error" — the same message it gives for a duplicate key and a full quota,
  // so the caller has no way to tell what went wrong. Verified against a live
  // profile: 5 characters rejected, 6 accepted.
  if ((value as string).length < MIN_VALUE_LENGTH) {
    failWith(`A secret value must be at least ${MIN_VALUE_LENGTH} characters (got ${(value as string).length}).`, "value_too_short", options.json);
  }

  return value as string;
}

export { buildValuePrompt, resolveSecretValue };
export type { ValueOptions };
