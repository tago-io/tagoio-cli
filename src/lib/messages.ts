import kleur from "kleur";

/**
 * @description Prints an `[ERROR]` message to stderr and terminates the process with exit code 1.
 *
 * @param str - Message to display to the user.
 */
function errorHandler(str: any): never {
  console.error(`[${kleur.red("ERROR")}] ${kleur.bold(str)}`);
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
 * @description Prints an `[OK]` message to stdout.
 *
 * @param str - Message to display to the user.
 */
function successMSG(str: any) {
  return console.info(`[${kleur.green("OK")}] ${str}`);
}

/**
 * @description Prints an `[INFO]` message to stdout.
 *
 * @param str - Message to display to the user.
 */
function infoMSG(str: any) {
  return console.info(`[${kleur.blue("INFO")}] ${str}`);
}

export { errorHandler, highlightMSG, successMSG, infoMSG };
