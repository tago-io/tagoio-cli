import { emitKeypressEvents } from "node:readline";

import { writeStatus } from "./messages.js";

interface WatchShortcutHandlers {
  /** Called on `q` and on the first Ctrl-C press. */
  onQuit: () => void | Promise<void>;
  /** Called on `r`. */
  onRestart: () => void | Promise<void>;
  /** Called on `c`. Defaults to writing the ANSI clear sequence to stderr. */
  onClear?: () => void;
  /** Called on the second Ctrl-C within the force-quit window. Defaults to `process.exit(130)`. */
  onForceQuit?: () => never;
}

interface WatchShortcutOptions {
  /** Hard gate. Caller should pass `process.stdin.isTTY && options.interactive !== false`. */
  enabled: boolean;
  /** Window (ms) within which a second Ctrl-C triggers force-quit. Default 2000. */
  forceQuitWindowMs?: number;
}

interface KeypressKey {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

const DEFAULT_FORCE_QUIT_WINDOW_MS = 2000;
const ANSI_CLEAR = "\x1Bc";

function defaultClear(): void {
  process.stderr.write(ANSI_CLEAR);
}

function defaultForceQuit(): never {
  process.exit(130);
}

/** Writes the shortcut help block to stderr. Reused by the `h` / `?` keys. */
function printShortcutHelp(): void {
  writeStatus("");
  writeStatus("Shortcuts:");
  writeStatus("  r           restart the analysis");
  writeStatus("  c           clear the screen");
  writeStatus("  h, ?        show this help");
  writeStatus("  q, Ctrl-C   quit (press Ctrl-C twice within 2s to force quit)");
  writeStatus("");
}

/**
 * Installs single-key shortcut handlers on `process.stdin` while a long-running
 * command (e.g. `tagoio run`) is active. Returns an idempotent teardown that
 * restores cooked mode and removes the listener. Safe to call with
 * `enabled: false` — returns a no-op teardown without touching stdin.
 *
 * Modeled on vitest's watch-mode handler — same Node primitives
 * (`readline.emitKeypressEvents` + `process.stdin.setRawMode`), no libraries.
 */
function installWatchShortcuts(handlers: WatchShortcutHandlers, options: WatchShortcutOptions): () => void {
  if (!options.enabled) {
    return () => {};
  }

  const forceQuitWindowMs = options.forceQuitWindowMs ?? DEFAULT_FORCE_QUIT_WINDOW_MS;
  let lastCtrlCAt = 0;
  let torn = false;

  const stdin = process.stdin;
  emitKeypressEvents(stdin);
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  // `emitKeypressEvents` alone does not flip stdin into flowing mode. With the
  // child spawned at `stdio: ["ignore", …]`, nothing else is reading the fd,
  // so without `resume()` the keypress events never fire.
  stdin.resume();

  const onKeypress = (_str: string, key: KeypressKey | undefined) => {
    if (!key) {
      return;
    }

    if (key.ctrl && key.name === "c") {
      const now = Date.now();
      if (lastCtrlCAt && now - lastCtrlCAt <= forceQuitWindowMs) {
        (handlers.onForceQuit ?? defaultForceQuit)();
        return;
      }
      lastCtrlCAt = now;
      void handlers.onQuit();
      return;
    }

    if (key.name === "h" || key.sequence === "?") {
      printShortcutHelp();
      return;
    }

    switch (key.name) {
      case "q":
        void handlers.onQuit();
        return;
      case "r":
        void handlers.onRestart();
        return;
      case "c":
        (handlers.onClear ?? defaultClear)();
        return;
      default:
        return;
    }
  };

  stdin.on("keypress", onKeypress);

  const teardown = () => {
    if (torn) {
      return;
    }
    torn = true;
    stdin.removeListener("keypress", onKeypress);
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    stdin.pause();
    process.off("exit", teardown);
  };

  // Defence-in-depth: if the parent crashes before the caller's finally runs,
  // restore cooked mode so the user's terminal does not get stuck in raw mode.
  process.once("exit", teardown);

  return teardown;
}

export { installWatchShortcuts, printShortcutHelp };
export type { WatchShortcutHandlers, WatchShortcutOptions };
