import { getEnvironmentConfig } from "../lib/config-file";
import { errorHandler } from "../lib/messages";
import { readToken } from "../lib/token";

/**
 * Returns the token and API URL for MCP configuration
 * @param environment - Optional environment name, defaults to current environment
 */
function mcpConfig(environment?: string) {
  let token: string | undefined;
  let apiUrl = "https://api.us-e1.tago.io";

  if (environment) {
    // Use specific environment
    token = readToken(environment);
    const config = getEnvironmentConfig(environment);
    if (config?.tagoAPIURL) {
      apiUrl = config.tagoAPIURL;
    }
  } else {
    // Use default environment
    const config = getEnvironmentConfig();
    if (!config) {
      errorHandler("No environment configured. Run 'tagoio init' or 'tagoio login' first.");
      return;
    }
    
    token = config.profileToken;
    if (config.tagoAPIURL) {
      apiUrl = config.tagoAPIURL;
    }
  }

  if (!token) {
    errorHandler(`No token found for environment. Run 'tagoio login' first.`);
    return;
  }

  // Encrypt token using base64
  const encryptedToken = Buffer.from(token).toString("base64");

  // Set environment variables for other applications to read
  process.env.TAGOIO_MCP_TOKEN = encryptedToken;
  process.env.TAGOIO_MCP_API = apiUrl;

  console.log("TOKEN and API exported.");
}

export { mcpConfig };