import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";

interface EditURLOptions {
  environment?: string;
  /** Profile token for this invocation, bypassing the lock file (CI/CD). */
  token?: string;
}

/**
 * Sets the "URL and Parameters" URL on a custom (iframe) widget. Reads the
 * widget first and merges into `display` so existing parameters, theme, and
 * frame settings are preserved.
 */
async function widgetEditURLCommand(dashboardID: string, widgetID: string, url: string, options: EditURLOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config) {
    errorHandler("Environment not found");
  }

  if (options.token) {
    config.profileToken = options.token;
  }
  if (!config.profileToken) {
    errorHandler("No profile token found. Pass --token or run 'tagoio login'.");
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const widget = await resources.dashboards.widgets.info(dashboardID, widgetID).catch((error) => errorHandler(`Widget could not be loaded: ${error}`));
  if (!widget) {
    return;
  }

  if (widget.type !== "iframe") {
    errorHandler(`Widget ${widgetID} is not a custom widget (type: ${widget.type}). Only iframe widgets have a URL.`);
  }

  infoMSG(`Updating URL on widget ${widgetID} ...`);
  await resources.dashboards.widgets
    .edit(dashboardID, widgetID, { display: { ...widget.display, url } })
    .catch((error) => errorHandler(`Widget URL update failed: ${error}`));

  successMSG(`Widget URL updated. widget=${widgetID} url=${url}`);
}

export { widgetEditURLCommand };
