import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { resolveResourcesMock, executeMoveMock, errorHandlerMock, infoMSGMock, successMSGMock } = vi.hoisted(() => ({
  resolveResourcesMock: vi.fn((..._args: unknown[]) => ({ resources: { marker: "resources" }, region: "us-e1" })),
  executeMoveMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  successMSGMock: vi.fn(),
}));

vi.mock("./move.js", () => ({
  executeMove: (...args: unknown[]) => executeMoveMock(...args),
}));

vi.mock("../../lib/resolve-resources.js", () => ({
  resolveResources: (...args: unknown[]) => resolveResourcesMock(...args),
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: infoMSGMock,
  successMSG: successMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

import { filesRenameCommand } from "./rename.js";

describe("filesRenameCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMoveMock.mockResolvedValue({ succeeded: 1, failed: 0, cancelled: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renames a file in place, keeping its directory", async () => {
    await filesRenameCommand("custom-widgets/lc/index.html", "app.html", {});

    expect(executeMoveMock).toHaveBeenCalledTimes(1);
    const params = executeMoveMock.mock.calls[0][0];
    expect(params.from).toBe("custom-widgets/lc/index.html");
    expect(params.to).toBe("custom-widgets/lc/app.html");
  });

  test("renames a folder, keeping its parent", async () => {
    executeMoveMock.mockResolvedValue({ succeeded: 3, failed: 0, cancelled: false });

    await filesRenameCommand("custom-widgets/line-chart", "line-chart-v2", { yes: true });

    const params = executeMoveMock.mock.calls[0][0];
    expect(params.from).toBe("custom-widgets/line-chart");
    expect(params.to).toBe("custom-widgets/line-chart-v2");
  });

  test("renames a top-level entry (no parent directory)", async () => {
    await filesRenameCommand("report.pdf", "final.pdf", {});

    expect(executeMoveMock.mock.calls[0][0].to).toBe("final.pdf");
  });

  test("rejects a newName containing a slash and points to files-move", async () => {
    await expect(filesRenameCommand("a/b.txt", "sub/c.txt", {})).rejects.toThrow(/files-move|slash|\//i);
    expect(executeMoveMock).not.toHaveBeenCalled();
  });

  test("passes --yes through as skipConfirm", async () => {
    executeMoveMock.mockResolvedValue({ succeeded: 2, failed: 0, cancelled: false });

    await filesRenameCommand("f", "g", { yes: true });

    expect(executeMoveMock.mock.calls[0][0].skipConfirm).toBe(true);
  });

  test("errors out when some files failed to rename", async () => {
    executeMoveMock.mockResolvedValue({ succeeded: 2, failed: 1, cancelled: false });

    await expect(filesRenameCommand("custom-widgets/lc", "lc-v2", { yes: true })).rejects.toThrow(/1 failed/);
    expect(successMSGMock).not.toHaveBeenCalled();
  });

  test("stays silent when the move was cancelled", async () => {
    executeMoveMock.mockResolvedValue({ succeeded: 0, failed: 0, cancelled: true });

    await filesRenameCommand("custom-widgets/lc", "lc-v2", {});

    expect(successMSGMock).not.toHaveBeenCalled();
    expect(errorHandlerMock).not.toHaveBeenCalled();
  });
});
