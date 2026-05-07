import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickDashboardIDFromTagoIO", () => {
  const dashboardList = [
    { id: "d1", label: "Dashboard One" },
    { id: "d2", label: "Dashboard Two" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the dashboard id the user picked", async () => {
    const account = makeAccount();
    account.dashboards.list.mockResolvedValue(dashboardList);

    const { pickDashboardIDFromTagoIO } = await import("./pick-dashboard-id-from-tagoio.js");
    prompts.inject(["d2"]);

    await expect(pickDashboardIDFromTagoIO(account as never)).resolves.toBe("d2");
    expect(account.dashboards.list).toHaveBeenCalledWith({ amount: 100, fields: ["id", "label"] });
  });

  test("calls errorHandler when the user cancels", async () => {
    const account = makeAccount();
    account.dashboards.list.mockResolvedValue(dashboardList);

    const { pickDashboardIDFromTagoIO } = await import("./pick-dashboard-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickDashboardIDFromTagoIO(account as never)).rejects.toThrow(/Dashboard not selected/);
  });
});
