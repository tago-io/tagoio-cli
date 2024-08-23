import { Account } from "@tago-io/sdk";
import axios from "axios";
import kleur from "kleur";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { chooseFromList } from "../../prompt/choose-from-list";
import { promptNumber } from "../../prompt/number-prompt";
import { pickFromList } from "../../prompt/pick-from-list";

interface BucketSettings {
  type: "mutable" | "immutable";
  chunk_period?: "day" | "week" | "month" | "quarter";
  chunk_retention?: number;
}

const coloredBucketType = (type: string) => (type === "mutable" ? kleur.green(type) : type === "legacy" ? kleur.red(type) : kleur.blue(type));

async function convertDevice(deviceID: string, settings: BucketSettings, profileToken: string) {
  const account = new Account({ token: profileToken, region: !process.env.TAGOIO_API ? "usa-1" : "env" });
  const deviceInfo = await account.devices.info(deviceID);
  const bucketType = deviceInfo.type;

  if (bucketType === settings.type) {
    return false;
  }

  await account.devices.emptyDeviceData(deviceID);
  await account.devices.edit(deviceID, { active: false });

  const reactiveDevice = async () => {
    if (deviceInfo.active !== false) {
      return account.devices.edit(deviceID, { active: true });
    }
  };

  const url = `https://api.tago.io/device/${deviceInfo.id}/convert`;
  const headers = { Authorization: `${profileToken}` };

  try {
    const response = await axios.post(url, settings, { headers });
    await reactiveDevice();
    return response.data;
  } catch (error) {
    await reactiveDevice();
    // console.log(error.response.data);
    throw error.response.data?.message;
  }
}

// function to copy device data
// this function will copy device data from mutable bucket to immutable bucket

async function startBucketChange(profileToken: string, deviceID: string, settings: BucketSettings) {
  await convertDevice(deviceID, settings, profileToken).catch((error) => {
    errorHandler(error);
    throw false;
  });

  successMSG(`> ${deviceID} - ${settings.type} bucket`);
}

async function chooseBucketsFromList(account: Account) {
  const bucketList = await account.devices.list({ fields: ["id", "name", "bucket", "type"] });
  if (!bucketList || bucketList.length === 0) {
    errorHandler("No buckets found");
    throw false;
  }

  const promptList = bucketList.map((bucket) => ({ title: `${bucket.name} - ${coloredBucketType(bucket.type)}`, value: bucket.id }));
  const chosenBucketList = await chooseFromList(promptList, "Choose a bucket to change type");
  if (!chosenBucketList) {
    errorHandler("No bucket selected");
    throw false;
  }
  return chosenBucketList;
}

async function changeBucketType(id: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }
  const account = new Account({ token: config.profileToken, region: !process.env.TAGOIO_API ? "usa-1" : "env" });
  const bucketList = id ? [id] : await chooseBucketsFromList(account);
  if (id) {
    const bucketInfo = await account.buckets.info(id);
    infoMSG(`> ${bucketInfo.name} - ${coloredBucketType(bucketInfo.type)} bucket\n`);
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
    await startBucketChange(config.profileToken, bucket, bucketTypeSettings);
  }
}

export { changeBucketType };
