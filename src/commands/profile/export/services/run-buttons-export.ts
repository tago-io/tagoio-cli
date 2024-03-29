import { Account } from "@tago-io/sdk";
import { RunInfo } from "@tago-io/sdk/lib/types";

import { infoMSG } from "../../../../lib/messages";
import { replaceObj } from "../../../../lib/replace-obj";
import { IExportHolder } from "../types";
import { storeExportBackup } from "./export-backup/export-backup";

interface ISidebarButton {
  color: string;
  href: string;
  iconUrl: string;
  text: string;
  type: string;
  value?: string;
}

interface ISigninButton {
  label: string;
  type: "link";
  url: string;
}

function updateSigninButtons(runInfo: RunInfo, targetRunInfo: RunInfo, exportHolder: IExportHolder) {
  const signin_buttons: ISigninButton[] = (runInfo as any).signin_buttons || [];
  for (const btn of signin_buttons) {
    btn.url = replaceObj(btn.url, exportHolder.dashboards);
  }

  (targetRunInfo as any).signin_buttons = signin_buttons;
}

function updateSideBarButtons(runInfo: RunInfo, targetRunInfo: RunInfo, exportHolder: IExportHolder) {
  const sidebar_buttons: ISidebarButton[] = runInfo.sidebar_buttons;
  for (const btn of sidebar_buttons) {
    if (btn.type !== "dashboard") {
      continue;
    }

    btn.value = exportHolder.dashboards[btn.value as string];
  }

  targetRunInfo.sidebar_buttons = sidebar_buttons;
}

async function runButtonsExport(account: Account, import_account: Account, export_holder: IExportHolder) {
  infoMSG("Run Buttons: started");

  const runInfo = await account.run.info();
  await storeExportBackup("original", "run", runInfo);

  const targetRunInfo = await import_account.run.info();
  await storeExportBackup("target", "run", targetRunInfo);

  export_holder.dashboards[runInfo.url] = targetRunInfo.url;
  export_holder.dashboards[runInfo.anonymous_token] = targetRunInfo.anonymous_token;

  updateSideBarButtons(runInfo, targetRunInfo, export_holder);
  updateSigninButtons(runInfo, targetRunInfo, export_holder);

  // Email Templates
  for (const template_name of Object.keys(runInfo.email_templates)) {
    const email_obj = runInfo.email_templates[template_name];
    targetRunInfo.email_templates[template_name] = email_obj;
  }

  // Custom Fields
  // @ts-expect-error SDK doesn't have custom fields property yet
  targetRunInfo.custom_fields = runInfo.custom_fields;

  targetRunInfo.signin_buttons = runInfo.signin_buttons;

  // @ts-expect-error ignore error
  delete targetRunInfo.created_at;

  await import_account.run.edit(targetRunInfo).catch((error) => {
    console.dir(JSON.stringify(error, null, 5));
    throw error;
  });

  console.info("Run Buttons: finished");
  return export_holder;
}

export { updateSideBarButtons, updateSigninButtons, runButtonsExport };
