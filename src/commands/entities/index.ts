import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { entityCopy } from "./entity-copy.js";
import { entityCreate } from "./entity-create.js";
import { entityData } from "./entity-data.js";
import { entityDelete } from "./entity-delete.js";
import { entityEdit } from "./entity-edit.js";
import { entityInfo } from "./entity-info.js";
import { entityList } from "./entity-list.js";
import { entitySchema } from "./entity-schema.js";

function handleNumber(value: string, _previous: unknown): number {
  if (Number.isNaN(Number(value))) {
    throw new Error(`${value} is not a number`);
  }
  if (Number(value) > 10000) {
    throw new Error(`Value ${value} exceeds maximum of 10000`);
  }
  return Number(value);
}

/**
 * @description Wires the eight `entity-*` commands. Mirrors the surface and
 * conventions established by deviceCommands / dashboardCommands. Every command
 * supports `--env` for environment selection and `--json` / `--silent` for
 * machine-driven / non-interactive callers (AI skills, CI pipelines).
 */
function entityCommands(program: Command): Command {
  program.command("Entities Header");

  program
    .command("entity-list")
    .alias("en-ls")
    .description("list entities in the active profile")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [substring]", "filter entities by partial name match")
    .option("-k, --tagkey [key]", "tag key to filter on (repeatable, paired with -v)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter on (repeatable, paired with -k)", cmdRepeatableValue, [])
    .option("--order-by <field>", "field to order by (name, created_at, updated_at)")
    .option("--order <asc/desc>", "order direction (default: asc)")
    .option("--json", "emit a JSON array on stdout for machine readers")
    .option("--stringify", "emit pretty-printed JSON on stdout")
    .option("--silent", "fail instead of prompting; required for non-interactive callers")
    .action(entityList)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio entity-list
    $ tagoio entity-list -n users
    $ tagoio entity-list --order-by created_at --order desc
    $ tagoio entity-list -k env -v prod --json | jq '.[0].id'

Output (--json): array of { id, name, tags, created_at, updated_at }`,
    );

  program
    .command("entity-info")
    .alias("en-nf")
    .description("show one entity's metadata and schema")
    .argument("[id]", "entity id; opens a picker when omitted")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "emit a single JSON object on stdout")
    .option("--stringify", "emit pretty-printed JSON on stdout")
    .option("--silent", "fail instead of prompting; required for non-interactive callers")
    .action(entityInfo)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio entity-info
    $ tagoio entity-info 65f8320dbef4690009a7d9dc --json

Output (--json): { id, name, schema, index, tags, created_at, updated_at }`,
    );

  program
    .command("entity-create")
    .alias("en-crt")
    .description("create a new entity (interactive by default; flag-driven via --schema-json)")
    .argument("[name]", "entity name; prompts when omitted (unless --silent)")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--schema <file>", "path to a JSON file with the full entity definition")
    .option("--schema-json <inline>", "inline JSON string with the full entity definition")
    .option("--silent", "fail instead of prompting; required for non-interactive callers")
    .option("--json", "emit {id, name} on stdout instead of the [OK] line")
    .action(entityCreate)
    .addHelpText(
      "after",
      `
    Schema format (file or --schema-json):
      {
        "name": "users",
        "tags": [{ "key": "env", "value": "prod" }],
        "schema": {
          "email":     { "type": "string", "required": true },
          "age":       { "type": "int" },
          "joined_at": { "type": "timestamp" }
        }
      }

Example:
    $ tagoio entity-create users
    $ tagoio entity-create --schema ./users.entity.json
    $ tagoio entity-create --schema-json '{"name":"users","schema":{"email":{"type":"string"}}}' --silent

Output (--json): { id, name }`,
    );

  program
    .command("entity-edit")
    .alias("en-ed")
    .description("update entity metadata (name)")
    .argument("[id]", "entity id; opens a picker when omitted")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name <new>", "new entity name")
    .option("--silent", "fail instead of prompting; required for non-interactive callers")
    .option("--json", "emit {id, ...patch} on stdout")
    .action(entityEdit)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio entity-edit 65f8320dbef4690009a7d9dc -n "Renamed"
    $ tagoio entity-edit 65f8320dbef4690009a7d9dc -n "Renamed" --silent

Output (--json): { id, ...patch }`,
    );

  program
    .command("entity-delete")
    .alias("en-dlt")
    .description("permanently delete an entity")
    .argument("[id]", "entity id; opens a picker when omitted")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--silent", "skip the confirmation prompt (required for non-interactive callers)")
    .option("--json", "emit {id, deleted: true} on stdout")
    .action(entityDelete)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio entity-delete 65f8320dbef4690009a7d9dc
    $ tagoio entity-delete 65f8320dbef4690009a7d9dc --silent

Output (--json): { id, deleted: true }`,
    );

  program
    .command("entity-data")
    .alias("en-dt")
    .description("read / write / edit / delete / empty / count entity records")
    .argument("[id]", "entity id; opens a picker when omitted")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--qty <n>", "number of records to fetch (read mode)", handleNumber)
    .option("--skip <n>", "records to skip (read mode pagination)", handleNumber)
    .option("-q, --query [field=value]", "filter by field=value (repeatable)", cmdRepeatableValue, [])
    .option("--json", "emit JSON on stdout for machine readers")
    .option("--stringify", "emit pretty-printed JSON on stdout")
    .option("-p, --post <json>", "insert the JSON payload as new record(s)")
    .option("--edit <json>", "edit existing record(s) (each item requires an id)")
    .option("--delete <ids>", "delete records by id (JSON array or comma-separated ids)")
    .option("--empty", "delete ALL records from the entity (prompts unless --silent)")
    .option("--count", "print the record count and exit")
    .option("--silent", "fail / skip confirms instead of prompting")
    .action(entityData)
    .addHelpText(
      "after",
      `
    Mutually-exclusive op flags: only one of --post, --edit, --delete, --empty, --count may be passed at a time. Default is read.

Example:
    $ tagoio entity-data <id>                                       # read top 100
    $ tagoio entity-data <id> --count
    $ tagoio entity-data <id> -p '{"email":"a@b.io"}'
    $ tagoio entity-data <id> --edit '{"id":"r1","email":"c@d.io"}'
    $ tagoio entity-data <id> --delete '["r1","r2"]' --silent
    $ tagoio entity-data <id> --empty --silent

Output (--json): read=array, post/edit/delete/empty={id, ..., result}, count={id, count}`,
    );

  program
    .command("entity-schema")
    .alias("en-sch")
    .description("manage entity schema (fields + indexes)")
    .argument("[id]", "entity id; opens a picker when omitted")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--add-field <json>", "add one field, JSON: { <name>: <typedef> }")
    .option("--update-field <json>", "update one field, JSON: { <name>: <typedef> }")
    .option("--rename-field <from:to>", "rename a field (colon-separated)")
    .option("--delete-field <name>", "delete a field (prompts unless --silent)")
    .option("--add-index <json>", "add one index, JSON: { <name>: { fields: [...] } }")
    .option("--delete-index <name>", "delete an index (prompts unless --silent)")
    .option("--json", "emit JSON on stdout for machine readers")
    .option("--stringify", "emit pretty-printed JSON on stdout")
    .option("--silent", "fail / skip confirms instead of prompting")
    .action(entitySchema)
    .addHelpText(
      "after",
      `
    Mutually-exclusive op flags: only one schema op may be passed at a time. Default is print the current schema.

Example:
    $ tagoio entity-schema <id>                                                          # print
    $ tagoio entity-schema <id> --add-field '{"age":{"type":"int"}}'
    $ tagoio entity-schema <id> --rename-field old:new
    $ tagoio entity-schema <id> --delete-field age --silent
    $ tagoio entity-schema <id> --add-index '{"by_age":{"fields":["age"]}}'

Output (--json): print={id, schema, index}, ops={id, <action>: <name>}`,
    );

  program
    .command("entity-copy")
    .alias("en-cp")
    .description("copy data from one entity to another within the same profile")
    .option("--from <id>", "source entity id (required)")
    .option("--to <id>", "target entity id (required)")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--qty <n>", "page size (default 10000; max 10000)", handleNumber)
    .option("--silent", "fail instead of prompting; required for non-interactive callers")
    .option("--json", "emit {from, to, copied} on stdout")
    .action(entityCopy)
    .addHelpText(
      "after",
      `
    Both source and target must already exist on the target profile with compatible schemas; v1 does not migrate.

Example:
    $ tagoio entity-copy --from <src-id> --to <tgt-id>
    $ tagoio entity-copy --from <src-id> --to <tgt-id> --qty 5000 --silent

Output (--json): { from, to, copied }`,
    );

  return program;
}

export { entityCommands };
