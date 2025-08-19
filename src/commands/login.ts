import prompts from "prompts";

import { Account } from "@tago-io/sdk";
import { OTPType } from "@tago-io/sdk";

import { addHttpsToUrl } from "../lib/add-https-to-url";
import { errorHandler, highlightMSG, successMSG } from "../lib/messages";
import { writeToken } from "../lib/token";

/**
 * @description Set the TagoIO deploy URL.
 */
async function getTagoDeployURL(): Promise<{ urlAPI: string; urlSSE: string } | undefined> {
  const { tagoDeployUrl } = await prompts({
    message: "Do you have a TagoIO Deploy customized API Endpoint?",
    type: "confirm",
    name: "tagoDeployUrl",
  });
  if (!tagoDeployUrl) {
    return;
  }

  let { urlAPI } = await prompts({ type: "text", name: "urlAPI", message: "Set the URL for the API service: ", hint: "https://api.tago.io" });
  if (!urlAPI) {
    return;
  }

  urlAPI = addHttpsToUrl(urlAPI);

  const sanitizedUrlAPI = new URL(urlAPI).origin;

  let { urlSSE } = await prompts({ type: "text", name: "urlSSE", message: "Set the URL for the SSE service: ", hint: "https://sse.tago.io" });

  urlSSE = addHttpsToUrl(urlSSE);

  if (!urlSSE) {
    urlSSE = sanitizedUrlAPI.replace("https://api.", "https://sse.");
  }

  if (urlSSE) {
    urlSSE = urlSSE.replace("api.", "sse.");

    const sseUrl = new URL(urlSSE);
    sseUrl.pathname = '/events';
    urlSSE = sseUrl.toString();
  }

  process.env.TAGOIO_API = sanitizedUrlAPI;
  process.env.TAGOIO_SSE = urlSSE;

  return { urlAPI: sanitizedUrlAPI, urlSSE };
}

function writeCustomToken(environment: string, token: string) {
  writeToken(token, environment);
  successMSG(`Token successfully written to the environment ${highlightMSG(environment)}.`);
}

interface LoginOptions {
  email?: string;
  password?: string;
  token?: string;
  tagoDeployUrl?: string;
  tagoDeploySse?: string;
}

/**
 * Handles the OTP login process.
 * @param {Object} options - The OTP login options.
 * @param {OTPType} options.otp_autosend - The OTP type to use for login.
 * @param {Object} loginOptions - The login options.
 * @param {string} loginOptions.email - The user's email.
 * @param {string} loginOptions.password - The user's password.
 * @returns {Promise<Object>} - The login result.
 */
async function handleOTPLogin({ otp_autosend }: { otp_autosend: OTPType }, { email, password }: Required<Pick<LoginOptions, "email" | "password">>) {
  if (otp_autosend !== "authenticator") {
    await Account.requestLoginPINCode({ email, password }, otp_autosend).catch(errorHandler);
  }

  const pinCode = await prompts({ type: "text", message: `Enter your PIN CODE [${otp_autosend}]: `, name: "value" });

  const loginResult = await Account.login({ email, password, otp_type: otp_autosend, pin_code: pinCode.value } as any).catch(errorHandler);
  if (!loginResult) {
    errorHandler("Login failed");
    return process.exit(1);
  }

  return { ...loginResult, otp_type: otp_autosend, pin_code: pinCode.value };
}

/**
 * Logs in a user with email and password.
 * @param email The user's email.
 * @param password The user's password.
 * @returns A promise that resolves to the login result.
 */
async function loginWithEmailPassword(email: string, password: string) {
  try {
    // @ts-expect-error ts don't know what kind of otp_enabled we are using
    const loginResult = await Account.login({ email, password });
    return loginResult;
  } catch (error) {
    try {
      const errorJSON = JSON.parse(error);
      if (errorJSON?.otp_enabled) {
        return handleOTPLogin(errorJSON, { email, password });
      }
    } catch {
      // Ignore JSON parsing errors
    }

    errorHandler(error);
  }
}

async function tagoLogin(environment: string, options: LoginOptions) {
  const tagoDeploy = await getTagoDeployURL();
  options.tagoDeployUrl = tagoDeploy?.urlAPI;
  options.tagoDeploySse = tagoDeploy?.urlSSE;

  if (options.token) {
    return writeCustomToken(environment, options.token);
  }

  let { email, password } = options;

  if (!email) {
    const question = await prompts({ type: "text", name: "email", message: "Enter your TagoIO email: " });
    ({ email } = question);
    if (!email) {
      return;
    }
  }
  if (!password) {
    const question = await prompts({ type: "password", name: "password", message: "Enter your password: " });
    ({ password } = question);
    if (!password) {
      return;
    }
  }

  const loginResult = await loginWithEmailPassword(email, password);
  if (!loginResult) {
    return;
  }

  const formatProfileName = (x: { name: string }) => `${x.name}${highlightMSG((x as any).from_share ? " [Shared with you]" : "")}`;

  const choices = loginResult.profiles.map((x) => ({ title: formatProfileName(x), value: x.id }));
  const profileQuestion = await prompts({ type: "autocomplete", choices, name: "id", message: "Which profile you want to choose? " });

  const result = await Account.tokenCreate({
    email,
    password,
    expire_time: "3 month",
    otp_type: (loginResult as any)?.otp_type || undefined,
    name: "Generated by TagoIO CLI",
    pin_code: (loginResult as any)?.pin_code || undefined,
    profile_id: profileQuestion.id,
  } as any).catch(errorHandler);

  if (!result) {
    return;
  }

  writeToken(result.token, environment);

  successMSG(`Token successfully written to the environment ${highlightMSG(environment)}.`);
  options.token = result.token;
}

export { tagoLogin, getTagoDeployURL };
