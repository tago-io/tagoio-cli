import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { runUserCreate } from "./run-user-create.js";
import { runUserDelete } from "./run-user-delete.js";
import { runUserEdit } from "./run-user-edit.js";
import { runUserInfo } from "./run-user-info.js";
import { runUserList } from "./run-user-list.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function runUserCommands(program: Command) {
  // Single word, like every other family's header. Commander parses anything
  // after the first word as arguments, so "Run Users Header" would render as
  // just "Run" anyway — this states the intent instead of stumbling into it.
  program.command("Run Header");

  program
    .command("run-user-list")
    .alias("ru-ls")
    .description("get the list of TagoRUN users.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [name]", "partial name of the run user")
    .option("-e, --email [email]", "partial email of the run user")
    .option("--active", "only active users")
    .option("--inactive", "only inactive users")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("--amount <number>", "how many run users to fetch (default: 100)", handleNumber)
    .option("--order-by <field>", "name, active, last_login, created_at or updated_at")
    .option("--order <direction>", "asc or desc (default: asc)")
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(runUserList)
    .addHelpText(
      "after",
      `
    These are the end users of the profile's TagoRUN portal, not the TagoIO
    account that owns the profile — run 'tagoio whoami' for that.

    A user who has never signed in reports last_login as "never".

    Note that email can be filtered but not ordered by; --order-by accepts
    only the five fields listed above.

Example:
    $ tagoio run-user-list
    $ tagoio run-user-list --email @acme.com
    $ tagoio run-user-list --inactive
    $ tagoio run-user-list --order-by last_login --order desc
    $ tagoio run-user-list -k access -v admin
       `,
    );

  program
    .command("run-user-info")
    .alias("ru-nf")
    .description("get information about a TagoRUN user.")
    .argument("[ID]", "ID of your run user")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the run user ID)")
    .action(runUserInfo)
    .addHelpText(
      "after",
      `
    --raw also surfaces otp, custom_preferences and agreements, which the API
    returns but the SDK types do not declare.

Example:
    $ tagoio run-user-info 62151835435d540010b768c4
    $ tagoio run-user-info 62151835435d540010b768c4 --json
       `,
    );

  program
    .command("run-user-create")
    .alias("ru-crt")
    .description("create a new TagoRUN user, typing the password at a masked prompt.")
    .argument("[email]", "email of the run user, which is their login identity")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--name <name>", "display name")
    .option("--timezone <timezone>", "IANA timezone, e.g. America/Sao_Paulo")
    .option("--company <company>", "company")
    .option("--phone <phone>", "phone number")
    .option("--language <language>", "language code, e.g. en")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--inactive", "create the user deactivated")
    // Declared even though it is always refused: without it commander reports
    // "unknown option", hiding the message that explains why the password has
    // to be typed.
    .option("--silent", "refused here — the password can only be typed at the prompt")
    .option("--json", "return result as json")
    .action(runUserCreate)
    .addHelpText(
      "after",
      `
    The password is typed at a prompt that masks the input, then confirmed. No
    flag carries it: a password passed as an argument would be written to shell
    history, visible to anyone running ps, and captured by CI logs.

    That means this command needs a terminal — it cannot run with --silent.

    Note that -k / -v set a tag, not the password.

    The email is the user's login identity and must be unique within the
    profile. A duplicate is reported before the password is asked for.

    --timezone defaults to the account's own timezone, since the API requires
    the field.

    A profile has a limited number of run users; the API reports its own limit
    when that is reached.

Example:
    $ tagoio run-user-create operator@acme.com --name "Ada Lovelace"
    $ tagoio run-user-create ops@acme.com --name Ops -k access -v admin
       `,
    );

  program
    .command("run-user-edit")
    .alias("ru-ed")
    .description("edit a TagoRUN user, reset their password or change their tags.")
    .argument("[ID]", "ID of your run user")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--name <name>", "display name")
    .option("--company <company>", "company")
    .option("--phone <phone>", "phone number")
    .option("--language <language>", "language code, e.g. en")
    .option("--timezone <timezone>", "IANA timezone, e.g. America/Sao_Paulo")
    .option("--activate", "mark the user active")
    .option("--deactivate", "mark the user inactive")
    .option("--reset-password", "prompt for a new password and replace the stored one")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--silent", "do not prompt (requires the run user ID; cannot be used with --reset-password)")
    .option("--json", "return result as json")
    .action(runUserEdit)
    .addHelpText(
      "after",
      `
    Tags REPLACE the existing set by default. Run users often carry tags that
    grant portal access, so pass --merge-tags to keep the ones you do not name.

    --reset-password prompts for the new password with the input masked, so it
    needs a terminal. Every other edit works under --silent.

    A run user's email is fixed. The API silently ignores the field, so there is
    no flag for it — to move a user to another address, delete them and create
    the new one.

Example:
    $ tagoio run-user-edit 62151835435d540010b768c4 --name "Ada L."
    $ tagoio run-user-edit 62151835435d540010b768c4 --reset-password
    $ tagoio run-user-edit 62151835435d540010b768c4 --deactivate
    $ tagoio run-user-edit 62151835435d540010b768c4 -k env -v staging --merge-tags
       `,
    );

  program
    .command("run-user-delete")
    .alias("ru-dlt")
    .description("permanently delete a TagoRUN user.")
    .argument("[ID]", "ID of your run user")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the run user ID)")
    .option("--json", "return result as json")
    .action(runUserDelete)
    .addHelpText(
      "after",
      `
    The user loses access to the portal immediately, and the account cannot be
    restored: created_at, last_login and the password do not survive, so
    recreating the email is not a way back.

Example:
    $ tagoio run-user-delete 62151835435d540010b768c4
    $ tagoio run-user-delete 62151835435d540010b768c4 -y
       `,
    );
}

export { runUserCommands };
