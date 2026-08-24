import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { dictCreate } from "./dict-create.js";
import { dictDelete } from "./dict-delete.js";
import { dictEdit } from "./dict-edit.js";
import { dictInfo } from "./dict-info.js";
import { dictLang } from "./dict-lang.js";
import { dictList } from "./dict-list.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function dictionaryCommands(program: Command) {
  program.command("Dictionaries Header");

  program
    .command("dict-list")
    .alias("dc-ls")
    .description("get the list of dictionaries.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [dictionaryName]", "partial name of the dictionary")
    .option("--amount <number>", "how many dictionaries to fetch (default: 100)", handleNumber)
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(dictList)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio dict-list
    $ tagoio dict-list --name Portal
    $ tagoio dict-list --json
       `,
    );

  program
    .command("dict-info")
    .alias("dc-nf")
    .description("get information about a dictionary and its languages.")
    .argument("[ID]", "ID of your dictionary")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the dictionary ID)")
    .action(dictInfo)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio dict-info 62151835435d540010b768c4
    $ tagoio dict-info 62151835435d540010b768c4 --json
       `,
    );

  program
    .command("dict-create")
    .alias("dc-crt")
    .description("create a new dictionary.")
    .argument("[name]", "name of the dictionary")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--slug <slug>", "slug used to reference the dictionary: uppercase alphanumerics, max 7 chars, e.g. PORTAL")
    .option("--fallback <locale>", "language served when a requested one is missing, e.g. en-US")
    .option("--silent", "do not prompt for missing input")
    .option("--json", "return result as json")
    .action(dictCreate)
    .addHelpText(
      "after",
      `
    Name, slug and fallback are all required by the API. Each prompts when
    omitted, and fails under --silent.

    The slug must be uppercase letters and digits only, at most 7 characters.

Example:
    $ tagoio dict-create "Portal Strings" --slug PORTAL --fallback en-US
       `,
    );

  program
    .command("dict-edit")
    .alias("dc-ed")
    .description("edit a dictionary's name, slug, or fallback language.")
    .argument("[ID]", "ID of your dictionary")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name <name>", "new dictionary name")
    .option("--slug <slug>", "new slug")
    .option("--fallback <locale>", "new fallback language, e.g. pt-BR")
    .option("--silent", "do not prompt (requires the dictionary ID)")
    .option("--json", "return result as json")
    .action(dictEdit)
    .addHelpText(
      "after",
      `
    Editing a dictionary does not touch its languages. Use dict-lang for that.

Example:
    $ tagoio dict-edit 62151835435d540010b768c4 --name "New Name"
    $ tagoio dict-edit 62151835435d540010b768c4 --fallback pt-BR
       `,
    );

  program
    .command("dict-lang")
    .alias("dc-lng")
    .description("read, write, or delete one language inside a dictionary.")
    .argument("[ID]", "ID of your dictionary, or its slug with --slug")
    .argument("<locale>", "language code, e.g. en-US")
    .option("--env, --environment [environment]", "environment from config.js")
    // read
    .option("--slug", "resolve the first argument as a slug instead of an ID")
    .option("--fallback", "fall back to the dictionary's fallback language for missing keys")
    // write
    .option("--file <path>", "JSON file of key/value pairs to write")
    .option("--set <KEY=value>", "set one key (repeatable)", cmdRepeatableValue, [])
    .option("--merge", "merge into the existing content (default: replace it)")
    .option("--inactive", "mark the language inactive (default: active)")
    // delete
    .option("--delete", "delete the language from the dictionary")
    .option("-y, --yes", "skip the replace/delete confirmation")
    .option("--silent", "do not prompt (requires the dictionary ID)")
    .option("-s, --stringify", "return content as pretty-printed text")
    .option("--json", "return result as json")
    .action(dictLang)
    .addHelpText(
      "after",
      `
    Writing replaces the whole language, because the API overwrites it rather
    than merging. Pass --merge to keep the keys your payload omits:

        tagoio dict-lang <id> pt-BR --set GREETING="Ola" --merge

    A replace that would drop keys asks for confirmation first, unless -y.

    Translation round-trip — export, translate, import:

        tagoio dict-lang <id> pt-BR --json > pt-BR.json
        # edit pt-BR.json
        tagoio dict-lang <id> pt-BR --file pt-BR.json

    Reading by ID shows only what the locale itself holds. Pass --fallback to
    fill missing keys from the fallback language. Note that --slug always
    applies the fallback: the API offers no way to disable it on that route, so
    use the ID form when exporting a translation.

Example:
    $ tagoio dict-lang 62151835435d540010b768c4 pt-BR
    $ tagoio dict-lang PORTAL pt-BR --slug
    $ tagoio dict-lang 62151835435d540010b768c4 pt-BR --file ./pt-BR.json
    $ tagoio dict-lang 62151835435d540010b768c4 pt-BR --delete
       `,
    );

  program
    .command("dict-delete")
    .alias("dc-dlt")
    .description("permanently delete a dictionary and every language in it.")
    .argument("[ID]", "ID of your dictionary")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the dictionary ID)")
    .option("--json", "return result as json")
    .action(dictDelete)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio dict-delete 62151835435d540010b768c4
    $ tagoio dict-delete 62151835435d540010b768c4 -y
       `,
    );
}

export { dictionaryCommands };
