import kleur from "kleur";

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

export { errorHandler, highlightMSG, successMSG, infoMSG };
