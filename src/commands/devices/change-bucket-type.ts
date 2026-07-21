import { Resources } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { chooseFromList } from "../../prompt/choose-from-list.js";
import { promptNumber } from "../../prompt/number-prompt.js";
import { pickFromList } from "../../prompt/pick-from-list.js";

interface BucketSettings {
  type: "mutable" | "immutable";
  chunk_period?: "day" | "week" | "month" | "quarter";
  chunk_retention?: number;
}

type environmentConfigResponse = NonNullable<ReturnType<typeof getEnvironmentConfig>>;

const coloredBucketType = (type: string) => (type === "mutable" ? kleur.green(type) : type === "legacy" ? kleur.red(type) : kleur.blue(type));

async function convertDevice(deviceID: string, settings: BucketSettings, config: environmentConfigResponse) {
  const resources = new Resources({ token: config.profileToken, region: config?.profileRegion });
  const deviceInfo = await resources.devices.info(deviceID).catch(errorHandler);
  if (!deviceInfo) {
    return;
  }
  const bucketType = deviceInfo.type;

  if (bucketType === settings.type) {
    return false;
  }

  await resources.devices.emptyDeviceData(deviceID);
  await resources.devices.edit(deviceID, { active: false });

  const reactiveDevice = async () => {
    if (deviceInfo.active !== false) {
      return resources.devices.edit(deviceID, { active: true });
    }
  };

  const defaultBaseURL = "https://api.tago.io";
  const userBaseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : defaultBaseURL;
  const url = `${userBaseURL}/device/${deviceInfo.id}/convert`;
  const headers = { Authorization: `${config.profileToken}` };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
      await reactiveDevice();
      throw errorBody?.message;
    }

    const data = await response.json();
    await reactiveDevice();
    return data;
  } catch (error) {
    await reactiveDevice();
    throw error;
  }
}

// function to copy device data
// this function will copy device data from mutable bucket to immutable bucket

async function startBucketChange(config: environmentConfigResponse, deviceID: string, settings: BucketSettings) {
  await convertDevice(deviceID, settings, config).catch((error) => {
    errorHandler(error);
  });

  const extras = [
    settings.chunk_period ? `chunk_period=${settings.chunk_period}` : "",
    settings.chunk_retention ? `chunk_retention=${settings.chunk_retention}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  successMSG(`Device bucket type changed. device=${kleur.blue(deviceID)} type=${coloredBucketType(settings.type)}${extras ? ` ${extras}` : ""}`);
}

async function chooseBucketsFromList(resources: Resources) {
  const bucketList = await resources.devices.list({ fields: ["id", "name", "bucket", "type"] }).catch(errorHandler);
  if (!bucketList || bucketList.length === 0) {
    errorHandler("No buckets found");
  }

  const promptList = bucketList.map((bucket) => ({ title: `${bucket.name} - ${coloredBucketType(bucket.type)}`, value: bucket.id }));
  const chosenBucketList = await chooseFromList(promptList, "Choose a bucket to change type");
  if (!chosenBucketList) {
    errorHandler("No bucket selected");
  }
  return chosenBucketList;
}

async function changeBucketType(id: string, options: { environment: string }) {
  printScopeBanner(resolveScope());

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
  }
  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const bucketList = id ? [id] : await chooseBucketsFromList(resources);
  if (id) {
    const bucketInfo = await resources.buckets.info(id).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      errorHandler(`Device with ID ${id} not found: ${message}`);
    });
    infoMSG(`Device: ${bucketInfo.name} - ${coloredBucketType(bucketInfo.type)} bucket`);
  }

  const bucketType = await pickFromList([{ title: "mutable" }, { title: "immutable" }], { message: "Choose the new bucket type" });
  if (!bucketType) {
    return;
  }

  const bucketTypeSettings: BucketSettings = {
    type: bucketType as "mutable" | "immutable",
  };

  if (bucketType === "immutable") {
    const chunkPeriod = await pickFromList([{ title: "day" }, { title: "week" }, { title: "month" }, { title: "quarter" }], {
      message: "Choose the chunk period",
    });

    bucketTypeSettings.chunk_period = chunkPeriod as "day" | "week" | "month" | "quarter";

    const chunkRetention = await promptNumber("Choose the chunk retention", { min: 1, max: 36, initial: 36 });
    bucketTypeSettings.chunk_retention = chunkRetention;
  }

  for (const bucket of bucketList) {
    await startBucketChange(config, bucket, bucketTypeSettings);
  }
}

export { changeBucketType };
