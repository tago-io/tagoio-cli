import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { sqlCreate } from "./sql-create.js";
import { sqlDelete } from "./sql-delete.js";
import { sqlEdit } from "./sql-edit.js";
import { sqlExecute } from "./sql-execute.js";
import { sqlInfo } from "./sql-info.js";
import { sqlList } from "./sql-list.js";
import { sqlTables } from "./sql-tables.js";
import { sqlVersion } from "./sql-version.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function sqlCommands(program: Command) {
  // One word before "Header": commander parses the rest as arguments, so a
  // two-word header would render truncated.
  program.command("TagoSQL Header");

  program
    .command("sql-list")
    .alias("sq-ls")
    .description("get the list of TagoSQL queries.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [name]", "partial name of the query")
    .option("--active", "only active queries")
    .option("--inactive", "only inactive queries")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("--amount <number>", "how many queries to fetch (default: 100)", handleNumber)
    .option("--order-by <field>", "name, active, created_at or updated_at")
    .option("--order <direction>", "asc or desc (default: asc)")
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(sqlList)
    .addHelpText(
      "after",
      `
    A listing returns id, name and tags only — the SQL text, params and cache
    settings come from 'sql-info <id>'.

Example:
    $ tagoio sql-list
    $ tagoio sq-ls --name freezer
    $ tagoio sq-ls --order-by created_at --order desc
       `,
    );

  program
    .command("sql-info")
    .alias("sq-nf")
    .description("get information about a TagoSQL query, including its SQL text.")
    .argument("[ID]", "ID of your SQL query")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the query ID)")
    .action(sqlInfo)
    .addHelpText(
      "after",
      `
    Shows the query text, its positional params, the cache settings and which
    version is live. The version count matters before deleting: the history goes
    with the query.

    --raw also surfaces cache_version, profile and the versions map, which the
    API returns but the SDK types do not declare.

Example:
    $ tagoio sql-info 62151835435d540010b768c4
    $ tagoio sql-info 62151835435d540010b768c4 --json
       `,
    );

  program
    .command("sql-create")
    .alias("sq-crt")
    .description("create a new TagoSQL query.")
    .argument("[name]", "name of the query")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--query <sql>", "the SQL statement (required)")
    .option("--query-file <path>", "read the SQL from a file instead")
    .option("--description <description>", "what the query is for")
    .option("--param <$n=value>", "positional param default (repeatable)", cmdRepeatableValue, [])
    .option("--cache", "enable the result cache")
    .option("--cache-ttl <seconds>", "cache lifetime, 0-86400 (0 disables)", handleNumber)
    .option("--rate-limit <rpm>", "per-query rate cap, subject to your plan's maximum", handleNumber)
    .option("--inactive", "create the query disabled — it cannot be executed")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--silent", "do not prompt (requires the name)")
    .option("--json", "return result as json")
    .action(sqlCreate)
    .addHelpText(
      "after",
      `
    Only SELECT statements are allowed, every table needs an alias, and a query
    must reference at least one table. The API validates the SQL and names the
    rule broken, so the statement is sent as written rather than checked here.

    Use --query-file for anything multi-line; SQL and shell quoting mix badly.

    Params are positional: --param '$1=value'. Discover the tables, columns and
    functions a query may use with 'sql-tables'.

    --cache-ttl is clamped server-side to 0-86400 seconds, so the stored value
    may differ from what you pass; --json reports what was stored.

Example:
    $ tagoio sql-create device_names --query "SELECT d.id, d.name FROM devices() AS d"
    $ tagoio sql-create freezer_summary --query-file summary.sql --param '\$1=device-id'
    $ tagoio sql-create hot_devices --query-file q.sql --cache --cache-ttl 3600
       `,
    );

  program
    .command("sql-edit")
    .alias("sq-ed")
    .description("edit a TagoSQL query: rename it, change its SQL, params or cache settings.")
    .argument("[ID]", "ID of your SQL query")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--name <name>", "new name")
    .option("--query <sql>", "replace the SQL statement")
    .option("--query-file <path>", "replace the SQL from a file")
    .option("--description <description>", "what the query is for")
    .option("--param <$n=value>", "replace the param defaults (repeatable)", cmdRepeatableValue, [])
    .option("--cache", "enable the result cache")
    .option("--no-cache", "disable the result cache")
    .option("--cache-ttl <seconds>", "cache lifetime, 0-86400 (0 disables)", handleNumber)
    .option("--rate-limit <rpm>", "per-query rate cap, subject to your plan's maximum", handleNumber)
    .option("--activate", "mark the query active")
    .option("--deactivate", "mark the query inactive — it can no longer be executed")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--silent", "do not prompt (requires the query ID)")
    .option("--json", "return result as json")
    .action(sqlEdit)
    .addHelpText(
      "after",
      `
    The API replaces the whole query rather than patching it, so this command
    reads the current one and merges your changes over it. Two consequences:
    an edit made in the admin between the read and the write is overwritten, and
    changing the SQL takes a new version — 'sql-version' recovers the previous
    one. Editing only metadata, like the name, leaves the version alone.

    --param replaces the whole param set rather than merging per key, so pass
    every param you want to keep.

Example:
    $ tagoio sql-edit 62151835435d540010b768c4 --name renamed
    $ tagoio sql-edit 62151835435d540010b768c4 --query-file updated.sql
    $ tagoio sql-edit 62151835435d540010b768c4 --deactivate
       `,
    );

  program
    .command("sql-execute")
    .alias("sq-run")
    .description("run a TagoSQL query and print its rows.")
    .argument("[ID]", "ID of your SQL query")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--param <$n=value>", "override a saved param for this run (repeatable)", cmdRepeatableValue, [])
    .option("--test", "skip the result cache entirely — no read, no write")
    .option("--after-device <id>", "fleet pagination cursor: the last device id of the previous page")
    .option("-s, --stringify", "return the result as indented json")
    .option("--json", "return the whole result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the query ID)")
    .action(sqlExecute)
    .addHelpText(
      "after",
      `
    Rows go to stdout and the timing line to stderr, so 'sql-run <id> > out.txt'
    captures data without the footer.

    Columns render in the order the query selected them, not alphabetically.

    Passing no --param uses the defaults saved with the query. An override
    applies to this run only and does not change what is stored.

    Executing a query reads device data, which counts against your profile's
    Data Output limit.

    A query created or edited with --inactive cannot be executed at all.

Example:
    $ tagoio sql-execute 62151835435d540010b768c4
    $ tagoio sq-run 62151835435d540010b768c4 --param '\$1=%Freezer%'
    $ tagoio sq-run 62151835435d540010b768c4 --json | jq '.rows'
       `,
    );

  program
    .command("sql-delete")
    .alias("sq-dlt")
    .description("permanently delete a TagoSQL query.")
    .argument("[ID]", "ID of your SQL query")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the query ID)")
    .option("--json", "return result as json")
    .action(sqlDelete)
    .addHelpText(
      "after",
      `
    Every saved version goes with the query. Re-creating it restores the SQL but
    not the history, so the confirmation names how many versions are at stake.

    To stop a query running without losing it, use
    'sql-edit <id> --deactivate' instead.

Example:
    $ tagoio sql-delete 62151835435d540010b768c4
    $ tagoio sql-delete 62151835435d540010b768c4 -y
       `,
    );

  program
    .command("sql-tables")
    .alias("sq-tbl")
    .description("list the tables, columns and functions a TagoSQL query may use.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--filter <text>", "substring match on device or entity name")
    .option("--amount <number>", "how many devices/entities to list (default: 20, max 100)", handleNumber)
    .option("--page <number>", "1-based page of devices/entities", handleNumber)
    .option("--entity <id>", "resolve the columns of one entity you own")
    .option("--json", "return result as json")
    .action(sqlTables)
    .addHelpText(
      "after",
      `
    The authoring reference: which tables exist, what columns they expose, which
    functions are callable, and the ids of your devices and entities ready to
    paste into a --param.

    The entity table reports no columns until you name one, because they depend
    on that entity's schema — pass --entity <id> to resolve them.

Example:
    $ tagoio sql-tables
    $ tagoio sql-tables --filter Freezer
    $ tagoio sql-tables --entity 62151835435d540010b768c4
       `,
    );

  program
    .command("sql-version")
    .alias("sq-rev")
    .description("read an earlier version of a TagoSQL query.")
    .argument("[ID]", "ID of your SQL query")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--rev <number>", "which version to read (required, 1-based)", handleNumber)
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the query ID)")
    .action(sqlVersion)
    .addHelpText(
      "after",
      `
    Changing the SQL takes a new version, so an edit that broke something can be
    traced to the revision that did it. Renaming or retagging does not — the
    history versions the query text, not its metadata. 'sql-info' reports how
    many exist.

    The flag is --rev because --version belongs to the CLI itself.

    Read-only: there is no rollback. To restore an old version, copy its SQL into
    'sql-edit --query', which saves it as a new version rather than rewinding.

Example:
    $ tagoio sql-version 62151835435d540010b768c4 --rev 1
    $ tagoio sql-version 62151835435d540010b768c4 --rev 8 --json
       `,
    );
}

export { sqlCommands };
