import { Account } from "@tago-io/sdk";
import { TagsObj } from "@tago-io/sdk/out/common/common.types";
import { DeviceQuery } from "@tago-io/sdk/out/modules/Account/devices.types";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";

interface IOptions {
  environment?: string;
  tagkey?: string;
  tagvalue?: string;
  name?: string;
  stringify?: boolean;
}

async function deviceList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });
  const filter: DeviceQuery = { amount: 50, fields: ["id", "name", "tags", "active", "last_input"], filter: { tags: [{}] } };
  if (filter.filter) {
    if (options.name) {
      filter.filter.name = `*${options.name}*`;
    }
    if (options.tagkey && filter.filter.tags) {
      filter.filter.tags[0].key = options.tagkey;
    }
    if (options.tagvalue && filter.filter.tags) {
      filter.filter.tags[0].value = options.tagvalue;
    }
  }

  const deviceList = await account.devices.list(filter);
  const mapTags = (tags: TagsObj[]) =>
    tags.reduce((f, t) => {
      f[t.key] = t.value;
      return f;
    }, {} as any);
  const mapDate = (date: Date | null) => (date ? `${date?.toLocaleDateString()} ${date?.toLocaleTimeString()}` : undefined);

  const resultList = deviceList.map((x) => ({ ...x, tags: mapTags(x.tags), last_input: mapDate(x.last_input) }));

  if (options.stringify) {
    console.info(JSON.stringify(resultList, null, 2));
  } else {
    console.table(resultList);
  }
  successMSG(`${deviceList.length} devices found.`);
}

export { deviceList };
