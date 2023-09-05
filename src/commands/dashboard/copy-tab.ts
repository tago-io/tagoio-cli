import kleur from "kleur";
import prompts from "prompts";

import { Account } from "@tago-io/sdk";
import { DashboardInfo } from "@tago-io/sdk/lib/types";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { confirmPrompt } from "../../prompt/confirm";
import { pickDashboardIDFromTagoIO } from "../../prompt/pick-dashboard-id-from-tagoio";

interface IOptions {
  to: string;
  from: string;
  environment: string;
  amount: number;
}

interface DashboardTabs {
  key: string;
  value: string;
  link: string;
  hidden: boolean;
}

/**
 *
 * @param account
 * @param dashID
 * @param arrangement
 * @param tabID
 * @returns
 */
async function deleteWidgetsFromTab(account: Account, dashID: string, arrangement: DashboardInfo["arrangement"], tabID: string) {
  if (!arrangement) {
    return;
  }

  const myTabWidgets = arrangement.filter((x) => x.tab === tabID);
  for (const item of myTabWidgets) {
    await account.dashboards.widgets.delete(dashID, item.widget_id);
  }

  return arrangement.filter((x) => x.tab !== tabID);
}

/**
 *
 * @param account
 * @param dashID
 * @param arrangement
 * @param tabID
 * @param toTabID
 * @returns
 */
async function copyWidgetsFromTab(account: Account, dashID: string, arrangement: DashboardInfo["arrangement"], tabID: string, toTabID: string) {
  if (!arrangement) {
    return;
  }

  const fromTabWidgets = arrangement.filter((x) => x.tab === tabID);
  for (const item of fromTabWidgets) {
    const widgetInfo = await account.dashboards.widgets.info(dashID, item.widget_id);
    const { widget: newWidgetID } = await account.dashboards.widgets.create(dashID, widgetInfo);
    arrangement.push({
      widget_id: newWidgetID,
      tab: toTabID,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    });
  }

  return arrangement;
}

/**
 *
 * @param list
 * @param message
 * @returns
 */
async function pickTabFromDashboard(list: { title: string; value: string }[], message: string = "Which tab you want to pick?") {
  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: list,
  });

  return id as string;
}

/**
 *
 * @param dashID
 * @param options
 * @returns
 */
async function copyTabWidgets(dashID: string, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });
  if (!dashID) {
    dashID = await pickDashboardIDFromTagoIO(account);
  }

  const dashInfo = await account.dashboards.info(dashID);

  if (!options.from || !options.to) {
    let tabList = (dashInfo.tabs as DashboardTabs[]).map((x, i) => ({ title: `${i}. ${x.value} [${x.key}]`, value: x.key }));
    if (!options.from) {
      options.from = await pickTabFromDashboard(tabList, "Pick a source tab to copy the data from:");
    }

    tabList = tabList.filter((x) => x.value !== options.from);
    if (!options.to) {
      options.to = await pickTabFromDashboard(tabList, "Pick a target tab to copy the data to: ");
    }
  }

  const { to, from } = options;
  if (to === from) {
    errorHandler("You can't copy data from and to the same tab");
    return;
  }

  const toTabName = (dashInfo.tabs as DashboardTabs[]).find((x) => x.key === to)?.value as string;
  const fromTabName = (dashInfo.tabs as DashboardTabs[]).find((x) => x.key === from)?.value as string;

  infoMSG(`> Copying tab ${kleur.cyan(fromTabName)} to ${kleur.cyan(toTabName)}...`);
  const yesNo = await confirmPrompt();
  if (!yesNo) {
    return;
  }

  let arrangement = await deleteWidgetsFromTab(account, dashID, dashInfo.arrangement, to);
  arrangement = await copyWidgetsFromTab(account, dashID, arrangement, from, to);

  await account.dashboards.edit(dashID, { arrangement });

  successMSG(`> Tab ${fromTabName} [${kleur.cyan(from)}] copied to ${toTabName} [${kleur.cyan(to)}]`);
}

export { copyTabWidgets };
