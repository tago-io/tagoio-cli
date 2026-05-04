import kleur from "kleur";
import prompts from "prompts";

/**
 * @description Writes a single line to stderr. All non-data CLI output (status,
 * progress, success confirmations, errors) goes here so that stdout stays clean
 * for machine-readable output (JSON, tables, etc.). Follows clig.dev: only data
 * on stdout; everything else on stderr.
 */
function writeStatus(line: string) {
  process.stderr.write(`${line}\n`);
}

/**
 * @description Prints an `[ERROR]` message to stderr and terminates the process
 * with exit code 1.
 *
 * @param str - Message to display to the user.
 */
function errorHandler(str: any): never {
  writeStatus(`[${kleur.red("ERROR")}] ${kleur.bold(str)}`);
  process.exit(1);
}

/**
 * @description Machine-readable counterpart to `errorHandler`. Writes a single
 * JSON object to stderr (`{"error":"<message>","code":"<slug>"}`) and exits 1.
 * Use when the caller passed `--json` so AI/script consumers can parse failures
 * the same way they parse success output.
 *
 * @param message - Human-readable failure description.
 * @param code - Optional short slug for programmatic dispatch (e.g. "not_found").
 */
function errorHandlerJSON(message: string, code?: string): never {
  const payload: { error: string; code?: string } = { error: message };
  if (code) {
    payload.code = code;
  }
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(1);
}

interface RequireOrFailOptions {
  /** When true, never fall back to the prompt — error out immediately if value is missing. */
  silent?: boolean;
  /** When true, errors emit JSON on stderr instead of `[ERROR] ...`. */
  json?: boolean;
  /** Free-text input prompt shown when interactive (silent === false). */
  promptMessage?: string;
  /** Optional initial value for the interactive prompt. */
  initial?: string;
}

/**
 * @description Returns `value` when present; otherwise either prompts the user
 * (interactive mode) or fails fast through `errorHandler` / `errorHandlerJSON`
 * (silent mode). The return is always a non-empty string — callers can assume
 * the input is satisfied after this function returns.
 *
 * Designed for AI / scripted callers: passing `--silent` guarantees that no
 * prompt is ever shown, and any missing required input becomes an actionable
 * error (`Missing required input: <name>`) immediately.
 *
 * @param value - The input the caller already has (e.g. from a CLI flag).
 * @param name - Field name surfaced in the error message.
 * @param opts - Mode flags (silent / json) and prompt configuration.
 */
async function requireOrFail(value: string | undefined | null, name: string, opts: RequireOrFailOptions = {}): Promise<string> {
  if (value) {
    return value;
  }

  if (opts.silent) {
    const message = `Missing required input: ${name}`;
    if (opts.json) {
      errorHandlerJSON(message, "missing_input");
    }
    errorHandler(message);
  }

  const { input } = await prompts({
    type: "text",
    name: "input",
    message: opts.promptMessage ?? `Enter ${name}:`,
    initial: opts.initial,
  });

  if (!input) {
    const message = `Missing required input: ${name}`;
    if (opts.json) {
      errorHandlerJSON(message, "missing_input");
    }
    errorHandler(message);
  }

  return input as string;
}

/**
 * @description Highlights a string in cyan color.
 *
 * @param str - String to be highlighted.
 * @returns The input string wrapped in cyan color formatting.
 */
function highlightMSG(str: any) {
  return kleur.cyan(str);
}

/**
 * @description Prints an `[OK]` status line to stderr (not stdout — stdout is
 * reserved for command data so pipes work cleanly).
 *
 * @param str - Message to display to the user.
 */
function successMSG(str: any) {
  writeStatus(`[${kleur.green("OK")}] ${str}`);
}

/**
 * @description Prints an `[INFO]` status line to stderr (not stdout — stdout is
 * reserved for command data so pipes work cleanly).
 *
 * @param str - Message to display to the user.
 */
function infoMSG(str: any) {
  writeStatus(`[${kleur.blue("INFO")}] ${str}`);
}

export { errorHandler, errorHandlerJSON, highlightMSG, infoMSG, requireOrFail, successMSG };
export type { RequireOrFailOptions };
