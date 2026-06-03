import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { installWatchShortcuts } from "./watch-shortcuts.js";

// Tests drive the keypress handler by emitting synthetic events on
// `process.stdin` — see vitest's own watch-mode tests for the same pattern.
// `setRawMode` is a TTY-only method, so we stub it on the stream before each
// test and restore it after.
describe("installWatchShortcuts", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let setRawModeMock: ReturnType<typeof vi.fn>;
  let originalIsTTY: boolean | undefined;
  let originalSetRawMode: typeof process.stdin.setRawMode | undefined;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setRawModeMock = vi.fn();
    originalIsTTY = process.stdin.isTTY;
    originalSetRawMode = process.stdin.setRawMode;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    process.stdin.setRawMode = setRawModeMock as never;
    vi.spyOn(process.stdin, "pause").mockImplementation(() => process.stdin);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalIsTTY });
    process.stdin.setRawMode = originalSetRawMode as typeof process.stdin.setRawMode;
    process.stdin.removeAllListeners("keypress");
  });

  test("enabled: false returns a no-op teardown and never touches setRawMode", () => {
    const onQuit = vi.fn();
    const teardown = installWatchShortcuts({ onQuit, onRestart: vi.fn() }, { enabled: false });
    expect(setRawModeMock).not.toHaveBeenCalled();
    teardown();
    process.stdin.emit("keypress", "q", { name: "q" });
    expect(onQuit).not.toHaveBeenCalled();
  });

  test("q triggers onQuit exactly once per press", () => {
    const onQuit = vi.fn();
    installWatchShortcuts({ onQuit, onRestart: vi.fn() }, { enabled: true });
    process.stdin.emit("keypress", "q", { name: "q" });
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  test("r triggers onRestart and can be pressed repeatedly across runs", () => {
    const onRestart = vi.fn();
    installWatchShortcuts({ onQuit: vi.fn(), onRestart }, { enabled: true });
    process.stdin.emit("keypress", "r", { name: "r" });
    process.stdin.emit("keypress", "r", { name: "r" });
    process.stdin.emit("keypress", "r", { name: "r" });
    expect(onRestart).toHaveBeenCalledTimes(3);
  });

  test("c invokes the default clear handler (writes ANSI clear to stderr)", () => {
    installWatchShortcuts({ onQuit: vi.fn(), onRestart: vi.fn() }, { enabled: true });
    process.stdin.emit("keypress", "c", { name: "c" });
    expect(stderrSpy).toHaveBeenCalledWith("\x1Bc");
  });

  test("c uses the caller-supplied onClear when provided", () => {
    const onClear = vi.fn();
    installWatchShortcuts({ onQuit: vi.fn(), onRestart: vi.fn(), onClear }, { enabled: true });
    process.stdin.emit("keypress", "c", { name: "c" });
    expect(onClear).toHaveBeenCalledOnce();
  });

  test("h prints the help block to stderr", () => {
    installWatchShortcuts({ onQuit: vi.fn(), onRestart: vi.fn() }, { enabled: true });
    process.stdin.emit("keypress", "h", { name: "h" });
    const written = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(written).toMatch(/restart/);
    expect(written).toMatch(/quit/);
  });

  test("? also prints the help block (sequence-based detection)", () => {
    installWatchShortcuts({ onQuit: vi.fn(), onRestart: vi.fn() }, { enabled: true });
    process.stdin.emit("keypress", "?", { sequence: "?", shift: true });
    const written = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(written).toMatch(/Shortcuts/);
  });

  test("double Ctrl-C within the force-quit window calls onForceQuit", () => {
    const onQuit = vi.fn();
    const onForceQuit = vi.fn(() => {
      throw new Error("force-quit");
    });
    installWatchShortcuts(
      { onQuit, onRestart: vi.fn(), onForceQuit: onForceQuit as unknown as () => never },
      { enabled: true, forceQuitWindowMs: 1000 },
    );

    process.stdin.emit("keypress", "\x03", { ctrl: true, name: "c" });
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(onForceQuit).not.toHaveBeenCalled();

    expect(() => process.stdin.emit("keypress", "\x03", { ctrl: true, name: "c" })).toThrow(/force-quit/);
    expect(onForceQuit).toHaveBeenCalledOnce();
  });

  test("double Ctrl-C OUTSIDE the window calls onQuit twice (no force)", async () => {
    const onQuit = vi.fn();
    const onForceQuit = vi.fn();
    installWatchShortcuts(
      { onQuit, onRestart: vi.fn(), onForceQuit: onForceQuit as unknown as () => never },
      { enabled: true, forceQuitWindowMs: 5 },
    );

    process.stdin.emit("keypress", "\x03", { ctrl: true, name: "c" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.stdin.emit("keypress", "\x03", { ctrl: true, name: "c" });

    expect(onQuit).toHaveBeenCalledTimes(2);
    expect(onForceQuit).not.toHaveBeenCalled();
  });

  test("unknown keys are dropped silently", () => {
    const onQuit = vi.fn();
    const onRestart = vi.fn();
    installWatchShortcuts({ onQuit, onRestart }, { enabled: true });
    expect(() => {
      process.stdin.emit("keypress", "x", { name: "x" });
      process.stdin.emit("keypress", "z", { name: "z" });
      process.stdin.emit("keypress", "", undefined);
    }).not.toThrow();
    expect(onQuit).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });

  test("teardown restores cooked mode and removes the keypress listener", () => {
    const onQuit = vi.fn();
    const teardown = installWatchShortcuts({ onQuit, onRestart: vi.fn() }, { enabled: true });
    expect(setRawModeMock).toHaveBeenCalledWith(true);

    teardown();
    expect(setRawModeMock).toHaveBeenCalledWith(false);

    process.stdin.emit("keypress", "q", { name: "q" });
    expect(onQuit).not.toHaveBeenCalled();
  });

  test("teardown is idempotent", () => {
    const teardown = installWatchShortcuts({ onQuit: vi.fn(), onRestart: vi.fn() }, { enabled: true });
    teardown();
    expect(() => teardown()).not.toThrow();
    // setRawMode(false) should only have fired once across both teardown calls.
    const falseCalls = setRawModeMock.mock.calls.filter(([arg]) => arg === false);
    expect(falseCalls).toHaveLength(1);
  });

  test("setRawMode is skipped when stdin is not a TTY even with enabled: true", () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    const onQuit = vi.fn();
    installWatchShortcuts({ onQuit, onRestart: vi.fn() }, { enabled: true });
    expect(setRawModeMock).not.toHaveBeenCalled();
    // The keypress listener is still wired, so emitted events still dispatch.
    process.stdin.emit("keypress", "q", { name: "q" });
    expect(onQuit).toHaveBeenCalledOnce();
  });
});
