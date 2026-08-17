import prompts from "prompts";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

/**
 * The CLI's own floor, not a rule read off the API.
 *
 * Every other family in this series probed the live API for its write-path
 * rules. That was unavailable here: the profile's Run user quota was full (2 of
 * 2) and a Run user cannot be restored once deleted, so no create could be
 * attempted. What the API actually enforces is therefore unknown, and the
 * message below deliberately does not claim otherwise.
 */
const MIN_PASSWORD_LENGTH = 8;

interface PasswordOptions {
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
 * @description Builds the entry prompt config. Exported so the prompt *type* is
 * assertable without driving the prompt itself — masking is the whole reason
 * this module exists, so it is worth a test of its own.
 */
function buildPasswordPrompt(message: string) {
  return { type: "password" as const, name: "password" as const, message };
}

/**
 * @description Builds the confirmation prompt config. Masked as well: an
 * unmasked confirmation would defeat the point of masking the first entry.
 */
function buildConfirmPrompt() {
  return { type: "password" as const, name: "confirm" as const, message: "Confirm password:" };
}

/**
 * @description Resolves the password for a TagoRUN user. There is exactly one
 * input: a masked prompt, asked twice.
 *
 * No flag carries the password. An argument-passed credential is written to
 * shell history, visible to any user running `ps` during execution, and
 * captured by CI logs — none of which apply to a value typed at a prompt.
 *
 * `requireOrFail` is not reusable here: it is hardcoded to `type: "text"`
 * (`messages.ts:82`) and would echo the credential as it is typed.
 *
 * The confirmation exists because a mistyped masked password is invisible by
 * definition, and the person it locks out is the one who cannot log in to
 * report it.
 *
 * Shaped after `secret-value.ts` but deliberately not shared with it: its
 * messages talk about secrets, and its minimum is a probed API rule rather than
 * a CLI-side floor.
 */
async function resolveRunUserPassword(options: PasswordOptions, message: string = "Password:"): Promise<string> {
  if (options.silent) {
    failWith("A password can only be typed at an interactive prompt, so this command cannot run with --silent.", "missing_input", options.json);
  }

  const { password } = await prompts(buildPasswordPrompt(message));

  // prompts reports a cancelled prompt (Ctrl+C, Esc) as an absent key, which is
  // indistinguishable from an empty submission. Both must fail: a passwordless
  // user would look like a successful create.
  if (!password) {
    failWith("No password given. A run user cannot have an empty password.", "empty_password", options.json);
  }

  // Checked before the confirmation is asked: retyping a password that is
  // already going to be rejected wastes the user's time.
  if ((password as string).length < MIN_PASSWORD_LENGTH) {
    failWith(`A password must be at least ${MIN_PASSWORD_LENGTH} characters (got ${(password as string).length}).`, "password_too_short", options.json);
  }

  const { confirm } = await prompts(buildConfirmPrompt());

  if (confirm !== password) {
    // Neither entry is echoed — the whole point is that they were never visible.
    failWith("The two passwords do not match.", "password_mismatch", options.json);
  }

  return password as string;
}

export { buildConfirmPrompt, buildPasswordPrompt, resolveRunUserPassword };
export type { PasswordOptions };
