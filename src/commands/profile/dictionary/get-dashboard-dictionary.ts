import { Account } from "@tago-io/sdk";
import { DashboardInfo } from "@tago-io/sdk/lib/types";

import { generateDictionaryKey } from "./generate-dictionary-key";
import { isDictionaryString } from "./is-dictionary-string";

async function getDashboardDictionary(dashboardInfo: DashboardInfo, account: Account) {
  const dashboardDictionaries: string[] = [];

  // Dashboard Name (label)
  const dashboardLabel = dashboardInfo.label;
  const isDashLabelDictionary = isDictionaryString(dashboardLabel);
  if (!isDashLabelDictionary) {
    dashboardDictionaries.push(dashboardLabel);
    const dictKey = generateDictionaryKey(dashboardLabel);
    dashboardInfo.label = `#AUTO.${dictKey}#`;
  }

  // Dashboard Tabs Names (value)
  const dashboardTabsValues = [];

  for (const tab of dashboardInfo.tabs) {
    if (tab.value !== undefined) {
      const isDashTabValueDictionary = isDictionaryString(tab.value);

      if (!isDashTabValueDictionary) {
        dashboardTabsValues.push(tab?.value);
        const dictKey = generateDictionaryKey(tab.value);
        tab.value = `#AUTO.${dictKey}#`;
      }
    }
  }

  // Dashboard Blueprint Devices (label and placeholder)
  const dashboardBlueprintDevicesLabel = [];
  const dashboardBlueprintDevicesPlaceholder = [];

  for (const device of dashboardInfo.blueprint_devices) {
    if (device.label !== undefined) {
      const isDashBlueprintDeviceLabelDictionary = isDictionaryString(device.label);

      if (!isDashBlueprintDeviceLabelDictionary) {
        dashboardBlueprintDevicesLabel.push(device.label);
        const dictKey = generateDictionaryKey(device.label);
        device.label = `#AUTO.${dictKey}#`;
      }
    }

    if (device.placeholder !== undefined) {
      const isDashBlueprintDevicePlaceholderDictionary = isDictionaryString(device.placeholder);

      if (!isDashBlueprintDevicePlaceholderDictionary) {
        dashboardBlueprintDevicesPlaceholder.push(device.placeholder);
        const dictKey = generateDictionaryKey(device.placeholder);
        device.placeholder = `#AUTO.${dictKey}#`;
      }
    }
  }

  // console.log({ dashboardLabel, dashboardTabsValues, dashboardBlueprintDevicesLabel, dashboardBlueprintDevicesPlaceholder });

  dashboardDictionaries.push(...dashboardTabsValues, ...dashboardBlueprintDevicesLabel, ...dashboardBlueprintDevicesPlaceholder);

  await account.dashboards.edit(dashboardInfo.id, dashboardInfo);

  return { dashboardDictionaries };
}

export { getDashboardDictionary };
