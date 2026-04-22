import { beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchResponse } from "../../../test-utils/mock-fetch.js";
import { makeEnvironmentConfig } from "../../../test-utils/mock-config.js";
import { makeAccount } from "../../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const infoMSGMock = vi.fn();
const successMSGMock = vi.fn();
let fetchMock: ReturnType<typeof installFetchMock>;

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
}));

vi.mock("../../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: infoMSGMock,
  successMSG: successMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

describe("listBackups", () => {
  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    infoMSGMock.mockClear();
    successMSGMock.mockClear();
    fetchMock = installFetchMock();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { listBackups } = await import("./list.js");
    await expect(listBackups({})).rejects.toThrow(/Environment not found/);
  });

  test("returns early when the profile info fetch fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.profiles.info.mockRejectedValue(new Error("nope"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { listBackups } = await import("./list.js");
    const result = await listBackups({});
    expect(result).toBeUndefined();
  });

  test("informs the user when no backups are available", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.profiles.info.mockResolvedValue({ info: { id: "profile-1", name: "Prof" } });
    fetchMock.mockResolvedValue(makeFetchResponse({ result: [] }));

    const { listBackups } = await import("./list.js");
    await listBackups({});

    expect(infoMSGMock).toHaveBeenCalledWith(expect.stringContaining("No backups"));
  });

  test("prints a table and reports success when backups are found", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.profiles.info.mockResolvedValue({ info: { id: "profile-1", name: "Prof" } });
    fetchMock.mockResolvedValue(
      makeFetchResponse({
        result: [
          { id: "b-1", status: "completed", created_at: "2026-04-01T00:00:00Z", file_size: 1024 },
        ],
      }),
    );

    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { listBackups } = await import("./list.js");
    await listBackups({});

    expect(tableSpy).toHaveBeenCalled();
    expect(successMSGMock).toHaveBeenCalledWith(expect.stringContaining("1"));
    tableSpy.mockRestore();
  });
});
