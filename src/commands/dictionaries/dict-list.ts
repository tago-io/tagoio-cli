import { type DictionaryQuery, Resources } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { mapDate } from "../devices/device-list.js";

interface IOptions {
  environment?: string;
  name?: string;
  amount?: number;
  stringify?: boolean;
  json?: boolean;
  raw?: boolean;
}

/** A dictionary's language entry, as `DictionaryInfo.languages` holds it. */
interface LanguageEntry {
  code: string;
  active: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Collapses the languages array into a readable cell. A table cell
 * renders an object as "[object Object]", so human mode shows the codes.
 */
function summarizeLanguages(languages: LanguageEntry[] | undefined): string {
  if (!languages?.length) {
    return "-";
  }
  return languages.map((language) => language.code).join(", ");
}

async function dictList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const query: DictionaryQuery = {
    amount: options.amount ?? 100,
    fields: ["id", "name", "slug", "fallback", "languages", "created_at", "updated_at"],
    filter: {},
  };

  if (query.filter && options.name) {
    query.filter.name = `*${options.name}*`;
  }

  const dictionaries = await resources.dictionaries.list(query).catch(errorHandler);
  if (!dictionaries) {
    return;
  }

  const machineMode = Boolean(options.json || options.stringify);
  const resultList = dictionaries.map((dictionary) => ({
    ...dictionary,
    languages: machineMode ? dictionary.languages : summarizeLanguages(dictionary.languages),
    created_at: mapDate(dictionary.created_at, options),
    updated_at: mapDate(dictionary.updated_at, options),
  }));

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(dictionaries.length)} dictionaries found.`);
}

export { dictList, summarizeLanguages };
