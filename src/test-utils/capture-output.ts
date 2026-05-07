import { vi } from "vitest";

// oxlint-disable-next-line no-control-regex
const ANSI_REGEX = /\[[0-9;]*m/g;
const stripAnsi = (s: string) => s.replace(ANSI_REGEX, "");

interface Capture {
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
}

function captureOutput(): Capture {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    stdoutLines.push(args.map(String).join(" "));
  });
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdoutLines.push(args.map(String).join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderrLines.push(args.map(String).join(" "));
  });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    stderrLines.push(args.map(String).join(" "));
  });

  const stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdoutLines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as never);
  const stderrWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stderrLines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as never);

  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__exit:${code ?? 0}`);
  }) as never);

  return {
    stdout: () => stripAnsi(stdoutLines.join("\n")),
    stderr: () => stripAnsi(stderrLines.join("\n")),
    restore: () => {
      infoSpy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      stdoutWriteSpy.mockRestore();
      stderrWriteSpy.mockRestore();
      exitSpy.mockRestore();
    },
  };
}

export { captureOutput, type Capture };
