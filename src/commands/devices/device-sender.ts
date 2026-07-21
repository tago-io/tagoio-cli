import { Device, Resources } from "@tago-io/sdk";

import { errorHandler } from "../../lib/messages.js";

/**
 * Resolves a `Device` instance authenticated with one of the device's own
 * tokens, suitable for sending data.
 *
 * Writing data through the profile token (`resources.devices.sendDeviceData`)
 * requires the "Device / Send data" Access Management policy, which profile
 * tokens do not carry by default — the API answers "Authorization denied". A
 * device token always authorizes writes to its own device, so data ingestion
 * goes through a `Device` instance instead. Reads/deletes stay on `Resources`.
 */
async function getDeviceForSending(resources: Resources, deviceID: string, region: ConstructorParameters<typeof Device>[0]["region"]) {
  const tokens = await resources.devices.tokenList(deviceID, { fields: ["token", "permission"] }).catch(errorHandler);
  const token = tokens?.find((t) => t.permission === "full" || t.permission === "write")?.token ?? tokens?.[0]?.token;
  if (!token) {
    return errorHandler(`No usable token found for device ${deviceID}. Create one with: tagoio device-token ${deviceID} --create "<name>"`);
  }
  return new Device({ token, region });
}

export { getDeviceForSending };
