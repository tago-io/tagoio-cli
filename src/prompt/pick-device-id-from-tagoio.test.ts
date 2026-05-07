import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickDeviceIDFromTagoIO", () => {
  const deviceList = [
    { id: "dev1", name: "Device One" },
    { id: "dev2", name: "Device Two" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the device id the user picked", async () => {
    const account = makeAccount();
    account.devices.list.mockResolvedValue(deviceList);

    const { pickDeviceIDFromTagoIO } = await import("./pick-device-id-from-tagoio.js");
    prompts.inject(["dev1"]);

    await expect(pickDeviceIDFromTagoIO(account as never)).resolves.toBe("dev1");
    expect(account.devices.list).toHaveBeenCalledWith({ amount: 100, fields: ["id", "name"] });
  });

  test("calls errorHandler when the user cancels", async () => {
    const account = makeAccount();
    account.devices.list.mockResolvedValue(deviceList);

    const { pickDeviceIDFromTagoIO } = await import("./pick-device-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickDeviceIDFromTagoIO(account as never)).rejects.toThrow(/Device not selected/);
  });
});
