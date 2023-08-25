import kleur from "kleur";

import { Account } from "@tago-io/sdk";
import { DeviceQuery, TagsObj } from "@tago-io/sdk/lib/types";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";

const mapTags = (tags: TagsObj[], opt: { [key: string]: any }) => {
  if (opt.raw) {
    return tags;
  }

  return tags.map((x) => ({ [x.key]: x.value }));
};

const mapDate = (date: Date | null, opt: { [key: string]: any }) => {
  if (opt.raw) {
    return date?.toISOString();
  }
  return date ? `${date?.toLocaleDateString()} ${date?.toLocaleTimeString()}` : undefined;
};

function repeatableTags(rawFilter: DeviceQuery, { keys, values }: { keys: string[]; values: string[] }) {
  if (!rawFilter.filter) {
    rawFilter.filter = {};
  }

  if (!rawFilter.filter.tags) {
    rawFilter.filter.tags = [];
  }

  const maxRows = Math.max(keys.length, values.length);
  for (let i = 0; i <= maxRows; i++) {
    const newTag: Partial<TagsObj> = {};
    if (keys[i]) {
      newTag.key = keys[i];
    }
    if (values[i]) {
      newTag.value = values[i];
    }
    rawFilter.filter.tags.push(newTag);
  }
}

interface IOptions {
  environment?: string;
  tagkey: string[];
  tagvalue: string[];
  name?: string;
  stringify?: boolean;
  json?: boolean;
  raw?: boolean;
}

async function deviceList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });
  const filter: DeviceQuery = { amount: 50, fields: ["id", "name", "active", "last_input"], filter: { tags: [{}] } };
  if (filter.filter && options.name) {
    filter.filter.name = `*${options.name}*`;
  }

  repeatableTags(filter, { keys: options.tagkey, values: options.tagvalue });
  const deviceList = await account.devices.list(filter);
  const resultList = deviceList.map((x) => ({
    ...x,
    tags: options.json || options.stringify ? mapTags(x.tags, options) : x.tags.length,
    last_input: mapDate(x.last_input, options),
  }));

  if (options.stringify) {
    console.info(JSON.stringify(resultList, null, 2));
  } else if (options.json) {
    console.dir(resultList, { depth: null });
  } else {
    console.table(resultList);
  }
  successMSG(`${kleur.cyan(deviceList.length)} devices found.`);
}

export { deviceList, mapDate, mapTags };
