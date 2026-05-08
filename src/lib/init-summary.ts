import kleur from "kleur";

import { InitState } from "./init-state.js";
import { ResolvedScope } from "./resolve-scope.js";

/**
 * @description Banner printed at the top of `tagoio init` so the user knows
 * what is about to happen and where it will land. Step 1 of the clig.dev flow.
 */
function banner(scope: ResolvedScope): string {
  return `Initializing tagoio in ${scope.root}...`;
}

/**
 * @description Multi-line block shown when an existing env would be overwritten.
 * Followed by a confirm prompt in interactive mode, or a hard error under
 * `--no-input`. Step 1 of the clig.dev flow.
 */
function overwriteConfirmCopy(state: InitState, envName: string): string {
  const sibling = state.scope.scope === "local"
    ? "Your global config located in ~/.config/tagoio/ will remain untouched."
    : "Your local config in any project directory will remain untouched.";
  return [
    `An existing configuration was found for env '${envName}' at ${state.scope.configPath}.`,
    "",
    "Reinitializing will overwrite your current keys and config.",
    sibling,
  ].join("\n");
}

/**
 * @description Running marker on stderr: `[..] <label>...`. Pair with
 * `endStep` (success) or `failStep` (failure). Step 3 of the clig.dev flow.
 */
function startStep(label: string): void {
  process.stderr.write(`[${kleur.cyan("..")}] ${label}...\n`);
}

/** Done marker on stderr: `[OK] <label>`. */
function endStep(label: string): void {
  process.stderr.write(`[${kleur.green("OK")}] ${label}\n`);
}

/** Failed marker on stderr: `[ERROR] <label>: <err>`. */
function failStep(label: string, err?: unknown): void {
  const suffix = err === undefined ? "" : `: ${err instanceof Error ? err.message : String(err)}`;
  process.stderr.write(`[${kleur.red("ERROR")}] ${label}${suffix}\n`);
}

interface SummaryInput {
  /** Files written or modified during execution, in the order they happened. */
  filesWritten: { path: string; description: string }[];
  scope: "local" | "global";
  /** Env name (the key under which this profile is stored in tagoconfig.json). */
  envName: string;
  /** Display name of the TagoIO profile (`profileName` from the env block). */
  profileName: string;
  /** API endpoint URL for this env. */
  apiEndpoint: string;
  /** SSE endpoint URL for this env (always paired with apiEndpoint). */
  sseEndpoint: string;
}

/**
 * @description Final state-change summary block. Lists every file written
 * along with the active scope, env name, profile name, and both endpoint
 * URLs. Step 4 of the clig.dev flow.
 *
 * Pure formatter: no I/O. Snapshot-testable in isolation.
 */
function summaryBlock(input: SummaryInput): string {
  const SEPARATOR = "---------------------------------------------------------";
  // Path column auto-sizes to the longest path, with a 2-space gap before the
  // (description) column so long paths don't run into the parenthesis.
  const longest = Math.max(0, ...input.filesWritten.map((f) => f.path.length));
  const fileLines = input.filesWritten.length > 0
    ? input.filesWritten.map((f) => `  ${f.path.padEnd(longest)}  (${f.description})`).join("\n")
    : "  (no files were written)";

  return [
    SEPARATOR,
    "Initialization complete.",
    "",
    "Created files:",
    fileLines,
    "",
    "Configuration:",
    `  Environment:  ${input.envName}`,
    `  Profile:      ${input.profileName}`,
    `  Scope:        ${input.scope}`,
    `  API URL:      ${input.apiEndpoint}`,
    `  SSE URL:      ${input.sseEndpoint}`,
    SEPARATOR,
  ].join("\n");
}

export { banner, overwriteConfirmCopy, startStep, endStep, failStep, summaryBlock, SummaryInput };
