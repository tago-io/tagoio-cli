import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetInjectedPrompts } from "../test-utils/reset-prompts.js";

const writeTokenMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const successMSGMock = vi.fn();
const accountLoginMock = vi.fn();
const accountTokenCreateMock = vi.fn();
const accountRequestLoginPINCodeMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Account: Object.assign(
    function Account() {
      return {};
    },
    {
      login: (...args: unknown[]) => accountLoginMock(...args),
      tokenCreate: (...args: unknown[]) => accountTokenCreateMock(...args),
      requestLoginPINCode: (...args: unknown[]) => accountRequestLoginPINCodeMock(...args),
    },
  ),
}));

vi.mock("../lib/token.js", () => ({
  writeToken: writeTokenMock,
}));

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  highlightMSG: (s: string) => s,
  successMSG: successMSGMock,
}));

vi.mock("../lib/resolve-scope.js", () => ({
  resolveScope: () => ({
    scope: "local" as const,
    root: "/repo",
    configPath: "/repo/tagoconfig.json",
    envFilePath: "/repo/.tagoio/personal.env",
    configExists: true,
  }),
  setScopeOverride: vi.fn(),
  globalConfigDir: () => "/home/user/.config/tagoio",
}));

vi.mock("../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("../lib/add-https-to-url.js", () => ({
  addHttpsToUrl: (url: string) => url,
}));

describe("tagoLogin", () => {
  beforeEach(() => {
    writeTokenMock.mockReset();
    errorHandlerMock.mockClear();
    successMSGMock.mockClear();
    accountLoginMock.mockReset();
    accountTokenCreateMock.mockReset();
    accountRequestLoginPINCodeMock.mockReset();
    resetInjectedPrompts();
  });

  test("writes the provided token directly without prompting for credentials", async () => {
    prompts.inject([false]);

    const { tagoLogin } = await import("./login.js");
    await tagoLogin("prod", { token: "custom-token" });

    expect(writeTokenMock).toHaveBeenCalledWith("custom-token", "prod");
    expect(successMSGMock).toHaveBeenCalled();
    expect(accountLoginMock).not.toHaveBeenCalled();
  });

  test("returns early when the user cancels the email prompt", async () => {
    prompts.inject([false, ""]);

    const { tagoLogin } = await import("./login.js");
    await tagoLogin("prod", {});

    expect(accountLoginMock).not.toHaveBeenCalled();
    expect(writeTokenMock).not.toHaveBeenCalled();
  });

  test("returns early when the user cancels the password prompt", async () => {
    prompts.inject([false, ""]);

    const { tagoLogin } = await import("./login.js");
    await tagoLogin("prod", { email: "user@example.com" });

    expect(accountLoginMock).not.toHaveBeenCalled();
    expect(writeTokenMock).not.toHaveBeenCalled();
  });

  test("logs in with email/password and writes the generated token", async () => {
    accountLoginMock.mockResolvedValue({
      profiles: [{ id: "p-1", name: "Primary" }],
    });
    accountTokenCreateMock.mockResolvedValue({ token: "new-token" });
    prompts.inject([false, "p-1"]);

    const { tagoLogin } = await import("./login.js");
    await tagoLogin("prod", { email: "user@example.com", password: "pw" });

    expect(accountLoginMock).toHaveBeenCalledWith({ email: "user@example.com", password: "pw" });
    expect(accountTokenCreateMock).toHaveBeenCalled();
    expect(writeTokenMock).toHaveBeenCalledWith("new-token", "prod");
    expect(successMSGMock).toHaveBeenCalled();
  });

  test("returns silently when tokenCreate fails", async () => {
    accountLoginMock.mockResolvedValue({
      profiles: [{ id: "p-1", name: "Primary" }],
    });
    accountTokenCreateMock.mockResolvedValue(undefined);
    prompts.inject([false, "p-1"]);

    const { tagoLogin } = await import("./login.js");
    await tagoLogin("prod", { email: "user@example.com", password: "pw" });

    expect(writeTokenMock).not.toHaveBeenCalled();
  });

  test("falls back to the OTP flow when login throws with otp_enabled", async () => {
    // First Account.login throws a JSON string with otp_enabled; handleOTPLogin re-calls with pin
    const otpErr = JSON.stringify({ otp_enabled: true, otp_autosend: "sms" });
    accountLoginMock
      .mockImplementationOnce(async () => {
        throw otpErr;
      })
      .mockResolvedValueOnce({ profiles: [{ id: "p-otp", name: "OTP" }] });
    accountRequestLoginPINCodeMock.mockResolvedValue(undefined);
    accountTokenCreateMock.mockResolvedValue({ token: "otp-token" });
    // Prompts injected in order: getTagoDeployURL(confirm=false), pin code text, profile choice
    prompts.inject([false, "123456", "p-otp"]);

    const { tagoLogin } = await import("./login.js");
    await tagoLogin("prod", { email: "user@example.com", password: "pw" });

    expect(accountRequestLoginPINCodeMock).toHaveBeenCalled();
    expect(writeTokenMock).toHaveBeenCalledWith("otp-token", "prod");
  });

  test("handleOTPLogin skips the PIN request when using the authenticator app", async () => {
    const otpErr = JSON.stringify({ otp_enabled: true, otp_autosend: "authenticator" });
    accountLoginMock
      .mockImplementationOnce(async () => {
        throw otpErr;
      })
      .mockResolvedValueOnce({ profiles: [{ id: "p-auth", name: "Auth" }] });
    accountTokenCreateMock.mockResolvedValue({ token: "auth-token" });
    // authenticator path does not call requestLoginPINCode
    prompts.inject([false, "654321", "p-auth"]);

    const { tagoLogin } = await import("./login.js");
    await tagoLogin("prod", { email: "user@example.com", password: "pw" });

    expect(accountRequestLoginPINCodeMock).not.toHaveBeenCalled();
    expect(writeTokenMock).toHaveBeenCalledWith("auth-token", "prod");
  });

  test("routes through errorHandler when login throws a non-otp error", async () => {
    accountLoginMock.mockImplementationOnce(async () => {
      throw new Error("bad credentials");
    });
    prompts.inject([false]);

    const { tagoLogin } = await import("./login.js");
    await expect(tagoLogin("prod", { email: "user@example.com", password: "pw" })).rejects.toThrow(/bad credentials/);
  });
});

describe("getTagoDeployURL", () => {
  beforeEach(() => {
    resetInjectedPrompts();
  });

  test("returns undefined when the user declines the deploy URL question", async () => {
    prompts.inject([false]);

    const { getTagoDeployURL } = await import("./login.js");
    const result = await getTagoDeployURL();
    expect(result).toBeUndefined();
  });

  test("returns the deploy URLs when provided", async () => {
    prompts.inject([true, "https://api.custom.tago.io", "https://sse.custom.tago.io"]);

    const { getTagoDeployURL } = await import("./login.js");
    const result = await getTagoDeployURL();
    expect(result?.urlAPI).toBe("https://api.custom.tago.io");
    expect(result?.urlSSE).toContain("sse.custom.tago.io");
  });

  test("returns undefined when the API URL prompt is cancelled", async () => {
    prompts.inject([true, ""]);

    const { getTagoDeployURL } = await import("./login.js");
    const result = await getTagoDeployURL();
    expect(result).toBeUndefined();
  });

  test("derives the SSE URL from the API URL when SSE is not provided", async () => {
    prompts.inject([true, "https://api.custom.tago.io", ""]);

    const { getTagoDeployURL } = await import("./login.js");
    const result = await getTagoDeployURL();
    expect(result?.urlAPI).toBe("https://api.custom.tago.io");
    expect(result?.urlSSE).toContain("sse.custom.tago.io");
  });
});
