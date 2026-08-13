import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string): void => {
  throw new Error(`json:${code}:${message}`);
});

const actionsListMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return {
      actions: { list: (...args: unknown[]) => actionsListMock(...args) },
    };
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
  successMSG: vi.fn(),
}));

const sampleAction = {
  id: "act1",
  name: "Alert",
  active: true,
  type: "condition",
  last_triggered: null,
  tags: [],
};

describe("actionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    errorHandlerMock.mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
    errorHandlerJSONMock.mockImplementation((message: string, code?: string) => {
      throw new Error(`json:${code}:${message}`);
    });
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { actionList } = await import("./action-list.js");
    await expect(actionList({ tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  // 200 is the Scale-plan ceiling for Actions, so the list can never truncate.
  test("requests up to the plan ceiling of 200 actions", async () => {
    actionsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [] } as never);

    expect(actionsListMock.mock.calls[0][0]).toMatchObject({
      amount: 200,
      fields: ["id", "name", "active", "type", "last_triggered", "tags"],
    });
  });

  test("wraps --name in wildcards", async () => {
    actionsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [], name: "alert" } as never);

    expect(actionsListMock.mock.calls[0][0].filter.name).toBe("*alert*");
  });

  test("sends exactly the tag pairs given, with no trailing empty entry", async () => {
    actionsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: ["type"], tagvalue: ["alarm"] } as never);

    expect(actionsListMock.mock.calls[0][0].filter.tags).toEqual([{ key: "type", value: "alarm" }]);
  });

  test("pairs multiple tags by index", async () => {
    actionsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: ["type", "zone"], tagvalue: ["alarm", "us-east"] } as never);

    expect(actionsListMock.mock.calls[0][0].filter.tags).toEqual([
      { key: "type", value: "alarm" },
      { key: "zone", value: "us-east" },
    ]);
  });

  test("omits the tag filter entirely when no tags are given", async () => {
    actionsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [] } as never);

    expect(actionsListMock.mock.calls[0][0].filter.tags).toBeUndefined();
  });

  test("--active filters on active true", async () => {
    actionsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [], active: true } as never);

    expect(actionsListMock.mock.calls[0][0].filter.active).toBe(true);
  });

  test("--inactive filters on active false", async () => {
    actionsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [], inactive: true } as never);

    expect(actionsListMock.mock.calls[0][0].filter.active).toBe(false);
  });

  test("--active with --inactive is rejected before any API call", async () => {
    const { actionList } = await import("./action-list.js");
    await expect(actionList({ tagkey: [], tagvalue: [], active: true, inactive: true } as never)).rejects.toThrow(/conflicting_flags/);
    expect(actionsListMock).not.toHaveBeenCalled();
  });

  test("conflicting flags report through the JSON channel when --json is set", async () => {
    const { actionList } = await import("./action-list.js");
    await expect(actionList({ tagkey: [], tagvalue: [], active: true, inactive: true, json: true } as never)).rejects.toThrow(/^json:conflicting_flags:/);
    expect(actionsListMock).not.toHaveBeenCalled();
  });

  test("prints a table by default", async () => {
    actionsListMock.mockResolvedValue([sampleAction]);
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [] } as never);

    expect(tableSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("--json emits one compact line to stdout", async () => {
    actionsListMock.mockResolvedValue([sampleAction]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [], json: true } as never);

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const output = String(stdoutSpy.mock.calls[0][0]);
    expect(JSON.parse(output)).toHaveLength(1);
    expect(output).not.toContain("\n  ");
  });

  test("--stringify pretty-prints to stdout", async () => {
    actionsListMock.mockResolvedValue([sampleAction]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [], stringify: true } as never);

    const output = String(stdoutSpy.mock.calls[0][0]);
    expect(() => JSON.parse(output)).not.toThrow();
    expect(output).toContain("\n  ");
  });

  /**
   * The SDK types `last_triggered` as `ExpireTimeOption` — `"never" | Date` —
   * and the API really does return the literal string "never" for an action
   * that has not fired yet. Passing that to `mapDate`, which calls
   * `toLocaleDateString`, crashes the command.
   */
  test("renders an action whose last_triggered is the string 'never'", async () => {
    actionsListMock.mockResolvedValue([{ ...sampleAction, last_triggered: "never" }]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { actionList } = await import("./action-list.js");
    await expect(actionList({ tagkey: [], tagvalue: [] } as never)).resolves.not.toThrow();
  });

  test("passes 'never' through to JSON output instead of crashing", async () => {
    actionsListMock.mockResolvedValue([{ ...sampleAction, last_triggered: "never" }]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [], json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))[0].last_triggered).toBe("never");
  });

  test("returns without output when the list request fails", async () => {
    actionsListMock.mockRejectedValue(new Error("api down"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { actionList } = await import("./action-list.js");
    await actionList({ tagkey: [], tagvalue: [] } as never);
  });
});
