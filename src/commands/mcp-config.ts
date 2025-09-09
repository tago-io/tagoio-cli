import { getEnvironmentConfig } from "../lib/config-file";
import { errorHandler } from "../lib/messages";
import { readToken } from "../lib/token";

/**
 * Gets token and API configuration for the specified environment
 */
function getTokenAndApi(environment?: string) {
  const config = getEnvironmentConfig(environment);
  
  if (!config && !environment) {
    errorHandler("No environment configured. Run 'tagoio init' or 'tagoio login' first.");
    return null;
  }

  const token = environment ? readToken(environment) : config?.profileToken;
  const apiUrl = config?.tagoAPIURL || "https://api.us-e1.tago.io";

  if (!token) {
    errorHandler("No token found for environment. Run 'tagoio login' first.");
    return null;
  }

  return { token, apiUrl };
}

/**
 * Sends MCP configuration data via IPC if available
 */
function sendMcpData(token: string, apiUrl: string) {
  if (process.send) {
    const encodedToken = Buffer.from(token).toString("base64");
    process.send({
      type: "mcp-config",
      token: encodedToken,
      api: apiUrl
    });
  }
}

/**
 * Returns token and API URL for MCP configuration via IPC
 */
function mcpConfig(environment?: string) {
  const config = getTokenAndApi(environment);
  
  if (!config) {
    return;
  }

  sendMcpData(config.token, config.apiUrl);
  process.exit(0);
}

export { mcpConfig };