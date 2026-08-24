import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { secretCreate } from "./secret-create.js";
import { secretDelete } from "./secret-delete.js";
import { secretEdit } from "./secret-edit.js";
import { secretInfo } from "./secret-info.js";
import { secretList } from "./secret-list.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function secretCommands(program: Command) {
  program.command("Secrets Header");

  program
    .command("secret-list")
    .alias("se-ls")
    .description("get the list of secrets.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --key [secretKey]", "partial key of the secret")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("--amount <number>", "how many secrets to fetch (default: 100)", handleNumber)
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(secretList)
    .addHelpText(
      "after",
      `
    A secret's value is never returned by the API, so the listing shows
    value_length instead. There is no way to read a value back.

Example:
    $ tagoio secret-list
    $ tagoio secret-list --key TWILIO
    $ tagoio secret-list -k env -v prod
    $ tagoio secret-list --json
       `,
    );

  program
    .command("secret-info")
    .alias("se-nf")
    .description("get information about a secret.")
    .argument("[ID]", "ID of your secret")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the secret ID)")
    .action(secretInfo)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio secret-info 62151835435d540010b768c4
    $ tagoio secret-info 62151835435d540010b768c4 --json
       `,
    );

  program
    .command("secret-create")
    .alias("se-crt")
    .description("create a new secret, typing its value at a masked prompt.")
    .argument("[key]", "key of the secret: uppercase letters, digits and underscores, e.g. TWILIO_SID")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    // Declared even though it is always refused: without it commander reports
    // "unknown option", hiding the message that explains why the value has to
    // be typed.
    .option("--silent", "refused here — the value can only be typed at the prompt")
    .option("--json", "return result as json")
    .action(secretCreate)
    .addHelpText(
      "after",
      `
    The value is typed at a prompt that masks the input. No flag carries it:
    a value passed as an argument would be written to shell history, visible
    to anyone running ps, and captured by CI logs.

    That means this command needs a terminal — it cannot run with --silent.

    Note that -k / -v set a tag, not the secret's value.

    The key is uppercased to match what the API stores, and a key containing
    anything but letters, digits and underscores is rejected before the call.

    The value must be at least 6 characters — the API refuses shorter ones.

    Keys are unique within a profile. A key already in use is reported before
    the value is asked for, since the API answers a duplicate with the same
    opaque error it uses for everything else.

Example:
    $ tagoio secret-create TWILIO_SID
    $ tagoio secret-create SENDGRID_KEY -k env -v prod
       `,
    );

  program
    .command("secret-edit")
    .alias("se-ed")
    .description("rotate a secret's value or change its tags.")
    .argument("[ID]", "ID of your secret")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--rotate", "prompt for a new value and replace the stored one")
    // Declared only to be refused with an explanation: the API has no way to
    // rename a key. Undeclared, commander answers "unknown option" and even
    // suggests --tagkey, which would silently do something else entirely.
    .option("--key <key>", "refused here — a secret's key cannot be changed")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--silent", "do not prompt (requires the secret ID; cannot be used with --rotate)")
    .option("--json", "return result as json")
    .action(secretEdit)
    .addHelpText(
      "after",
      `
    --rotate prompts for the new value with the input masked, so it needs a
    terminal. Tag-only edits work under --silent.

    A secret's key cannot be changed. To rename one, delete it and create it
    again under the new key.

Example:
    $ tagoio secret-edit 62151835435d540010b768c4 --rotate
    $ tagoio secret-edit 62151835435d540010b768c4 -k env -v staging --merge-tags
       `,
    );

  program
    .command("secret-delete")
    .alias("se-dlt")
    .description("permanently delete a secret.")
    .argument("[ID]", "ID of your secret")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the secret ID)")
    .option("--json", "return result as json")
    .action(secretDelete)
    .addHelpText(
      "after",
      `
    The value cannot be recovered afterwards — it was never readable — and any
    Action or Analysis referencing this secret will stop working.

Example:
    $ tagoio secret-delete 62151835435d540010b768c4
    $ tagoio secret-delete 62151835435d540010b768c4 -y
       `,
    );
}

export { secretCommands };
