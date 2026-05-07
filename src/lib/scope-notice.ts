import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ResolvedScope } from "./resolve-scope.js";

/**
 * @description Emits a one-time stderr notice announcing the new global/local
 * profile model. Suppressed by a per-user sentinel at
 * `~/.tagoio/.scope-notice-shown` so it fires once per machine — never per
 * project, which would risk the sentinel being committed via `git add .` and
 * silencing the notice for teammates.
 *
 * Best-effort: failures to write the sentinel are swallowed so a read-only
 * home directory never blocks the command.
 */
function maybeShowScopeNotice(scope: ResolvedScope): void {
  const sentinel = path.join(os.homedir(), ".tagoio", ".scope-notice-shown");
  if (existsSync(sentinel)) {
    return;
  }

  if (scope.scope !== "local") {
    // Global scope: a fresh user with no config will be guided by `tagoio init`.
    // Nothing to announce.
    return;
  }

  process.stderr.write(
    `[INFO] tagoio now supports global and local profiles. This project is using the local profile. ` +
      `Run \`tagoio init --scope global\` to set up a global profile. ` +
      `This message will not appear again.\n`,
  );

  try {
    mkdirSync(path.dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, "");
  } catch {
    /* best-effort; never fail the command for sentinel write */
  }
}

/**
 * @description Prints a one-line `[INFO] Using <scope> profile (<path>)`
 * banner to stderr. Mutating-command handlers call this as their first action
 * so the user sees which profile they are about to mutate before the command
 * runs.
 *
 * Suppressed when `silent` is true, matching the existing `--silent` contract
 * (silent users explicitly opted out of all stderr noise; the banner is a UX
 * safety net, not a security gate).
 */
function printScopeBanner(scope: ResolvedScope, silent = false): void {
  if (silent) {
    return;
  }
  process.stderr.write(`[INFO] Using ${scope.scope} profile (${scope.configPath})\n`);
}

export { maybeShowScopeNotice, printScopeBanner };
