import type { Command } from "commander";
import { describe, expect, test } from "vitest";

import { buildPopulatedProgram } from "./generate-man.js";

/**
 * Every alias the CLI ships, as command -> alias. Commands that carry no alias
 * are deliberately absent rather than listed as null: this table is what a
 * future cleanup has to justify changing, not an inventory of the whole CLI.
 *
 * The scheme is a family prefix plus a 2-3 character verb: ls, nf, crt, ed,
 * dlt, cp, dt, sch, on, off, lng, tbl, rev, run, tkn, prm, tp, up, dl, url,
 * mv, rn. It saves about seven characters per command, which is what makes an
 * alias worth typing at all.
 *
 * The twelve single-word aliases at the end predate the scheme and ship in the
 * published package, so they keep their names.
 */
const EXPECTED_ALIASES: ReadonlyArray<readonly [string, string]> = [
  // Actions use "act-" rather than "ac-": the bare "ac" is analysis-console, so
  // an "ac-*" family would put two resources under one prefix.
  ["action-list", "act-ls"],
  ["action-info", "act-nf"],
  ["action-create", "act-crt"],
  ["action-edit", "act-ed"],
  ["action-enable", "act-on"],
  ["action-disable", "act-off"],
  ["action-delete", "act-dlt"],
  // Dictionaries
  ["dict-list", "dc-ls"],
  ["dict-info", "dc-nf"],
  ["dict-create", "dc-crt"],
  ["dict-edit", "dc-ed"],
  ["dict-lang", "dc-lng"],
  ["dict-delete", "dc-dlt"],
  // Secrets
  ["secret-list", "se-ls"],
  ["secret-info", "se-nf"],
  ["secret-create", "se-crt"],
  ["secret-edit", "se-ed"],
  ["secret-delete", "se-dlt"],
  // Run users
  ["run-user-list", "ru-ls"],
  ["run-user-info", "ru-nf"],
  ["run-user-create", "ru-crt"],
  ["run-user-edit", "ru-ed"],
  ["run-user-delete", "ru-dlt"],
  // Analysis CRUD is on the scheme; the six older commands keep their words.
  ["analysis-list", "an-ls"],
  ["analysis-info", "an-nf"],
  ["analysis-create", "an-crt"],
  ["analysis-edit", "an-ed"],
  ["analysis-delete", "an-dlt"],
  // Access management
  ["access-management-list", "am-ls"],
  ["access-management-info", "am-nf"],
  ["access-management-create", "am-crt"],
  ["access-management-edit", "am-ed"],
  ["access-management-delete", "am-dlt"],
  // TagoSQL
  ["sql-list", "sq-ls"],
  ["sql-info", "sq-nf"],
  ["sql-create", "sq-crt"],
  ["sql-edit", "sq-ed"],
  ["sql-execute", "sq-run"],
  ["sql-delete", "sq-dlt"],
  ["sql-tables", "sq-tbl"],
  ["sql-version", "sq-rev"],
  // Devices: list, info, inspector, backup and network keep the word aliases
  // listed at the end of this table.
  ["device-create", "dv-crt"],
  ["device-edit", "dv-ed"],
  ["device-delete", "dv-dlt"],
  ["device-token", "dv-tkn"],
  ["device-param", "dv-prm"],
  ["device-type", "dv-tp"],
  ["device-copy", "dv-cp"],
  // Entities
  ["entity-list", "en-ls"],
  ["entity-info", "en-nf"],
  ["entity-create", "en-crt"],
  ["entity-edit", "en-ed"],
  ["entity-delete", "en-dlt"],
  ["entity-data", "en-dt"],
  ["entity-schema", "en-sch"],
  ["entity-copy", "en-cp"],
  // Files
  ["files-list", "fl-ls"],
  ["files-upload", "fl-up"],
  ["files-download", "fl-dl"],
  ["files-url", "fl-url"],
  ["files-move", "fl-mv"],
  ["files-rename", "fl-rn"],
  ["files-copy", "fl-cp"],
  ["files-delete", "fl-dlt"],
  ["files-permission", "fl-prm"],
  // Published in the npm package before the scheme existed. Renaming any of
  // these breaks callers, so they stay as they are.
  ["analysis-deploy", "deploy"],
  ["analysis-run", "run"],
  ["analysis-trigger", "at"],
  ["analysis-console", "ac"],
  ["analysis-duplicate", "ad"],
  ["analysis-mode", "am"],
  ["device-inspector", "inspect"],
  ["device-info", "info"],
  ["device-list", "dl"],
  ["device-backup", "bkp"],
  ["device-network", "nc"],
  ["app-export", "export"],
];

/**
 * @description Every command in the tree, each paired with the scope it is
 * registered under ("" for the root, "backup" for a backup subcommand).
 *
 * Commander resolves a token against the containing command's own subcommand
 * list, so `backup create` and a top-level `create` can coexist. Collisions are
 * therefore per-scope: a flat scan of `program.commands` would both miss a
 * collision nested under `backup` and invent ones that cannot happen.
 */
function walkCommands(root: Command) {
  const found: Array<{ scope: string; command: Command }> = [];

  const visit = (parent: Command, scope: string) => {
    for (const command of parent.commands) {
      found.push({ scope, command });
      visit(command, scope ? `${scope} ${command.name()}` : command.name());
    }
  };

  visit(root, "");
  return found;
}

/**
 * Commander throws at registration on a duplicate — an alias colliding with
 * another alias OR with a command name — which takes the whole CLI down at
 * startup rather than failing just the new command. The `al` and `am` near
 * misses were caught only because the man test happens to build the tree.
 *
 * These tests make that check explicit. They assert on the built program, not
 * on the generated roff: the man page never records aliases, so the assertions
 * in generate-man.test.ts match example text and would stay green if an alias
 * were deleted.
 */
describe("alias registry", () => {
  test("no token is claimed twice within the same command scope", () => {
    const program = buildPopulatedProgram();

    const owners = new Map<string, string>();
    const collisions: string[] = [];
    for (const { scope, command } of walkCommands(program)) {
      for (const token of [command.name(), ...command.aliases()]) {
        const key = `${scope}\u0000${token}`;
        const owner = owners.get(key);
        if (owner) {
          collisions.push(`"${token}" claimed by both ${owner} and ${command.name()} under "${scope || "(root)"}"`);
        }
        owners.set(key, command.name());
      }
    }

    expect(collisions).toEqual([]);
  });

  test("no alias shadows a command name in the same scope", () => {
    const program = buildPopulatedProgram();
    const commands = walkCommands(program);

    const namesByScope = new Map<string, Set<string>>();
    for (const { scope, command } of commands) {
      const names = namesByScope.get(scope) ?? new Set<string>();
      names.add(command.name());
      namesByScope.set(scope, names);
    }

    const shadowed = commands.flatMap(({ scope, command }) =>
      command
        .aliases()
        .filter((alias) => namesByScope.get(scope)?.has(alias))
        .map((alias) => `${command.name()} -> ${alias}`),
    );

    expect(shadowed).toEqual([]);
  });

  test.each(EXPECTED_ALIASES)("%s keeps the alias %s", (name, alias) => {
    const program = buildPopulatedProgram();
    const command = program.commands.find((candidate) => candidate.name() === name);

    expect(command, `command ${name} is not registered`).toBeDefined();
    expect(command?.aliases()).toContain(alias);
  });

  test("every registered alias is accounted for in the table above", () => {
    const program = buildPopulatedProgram();

    const declared = new Set(EXPECTED_ALIASES.map(([, alias]) => alias));
    const undeclared = walkCommands(program).flatMap(({ command }) =>
      command
        .aliases()
        .filter((alias) => !declared.has(alias))
        .map((alias) => `${command.name()} -> ${alias}`),
    );

    // A new alias must be added to EXPECTED_ALIASES, so the table stays the one
    // place that records what the CLI answers to.
    expect(undeclared).toEqual([]);
  });
});
