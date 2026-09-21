import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

interface KeyOptions {
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Normalizes a secret key to what the API will actually store, and
 * rejects the characters it refuses.
 *
 * Neither rule is in the SDK types or the docs — both were found by probing a
 * live profile:
 *
 *   - the API **uppercases** the key, so `lowercase` comes back `LOWERCASE`.
 *     Doing it here keeps `--json` honest about what was stored, instead of
 *     echoing back a key that does not exist.
 *   - only uppercase letters, digits and underscores are accepted. A hyphen,
 *     space or dot is refused with "Sorry, Internal Error", which says nothing
 *     about what went wrong — hence the offline check naming the character.
 */
function normalizeSecretKey(key: string, options: KeyOptions = {}): string {
  const normalized = key.toUpperCase();

  const offending = [...normalized].find((char) => !/[A-Z0-9_]/.test(char));
  if (offending !== undefined) {
    failWith(
      `Invalid key "${key}": the character "${offending}" is not allowed. Use uppercase letters, digits and underscores, e.g. TWILIO_SID.`,
      "invalid_key",
      options.json,
    );
  }

  if (normalized.length === 0) {
    failWith("A secret key cannot be empty.", "invalid_key", options.json);
  }

  return normalized;
}

export { normalizeSecretKey };
export type { KeyOptions };
