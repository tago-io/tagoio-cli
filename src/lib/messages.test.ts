import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import * as messagesModule from "./messages.js";
import { errorHandler, infoMSG, successMSG } from "./messages.js";

// kleur emits ANSI escape codes; strip them so assertions match plain text.
// oxlint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\u001B\[[0-9;]*m/g, "");

describe("messages", () => {
	let _stdout: ReturnType<typeof vi.spyOn>;
	let _stderr: ReturnType<typeof vi.spyOn>;
	let consoleInfo: ReturnType<typeof vi.spyOn>;
	let consoleError: ReturnType<typeof vi.spyOn>;
	let exit: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		_stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		_stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
		consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
			throw new Error(`__exit:${code}`);
		}) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("errorHandler", () => {
		test("exits with code 1 so the OS/shell/CI treats the run as failed", () => {
			expect(() => errorHandler("something broke")).toThrow("__exit:1");
			expect(exit).toHaveBeenCalledWith(1);
		});

		test("writes the error message to stderr (via console.error), not stdout", () => {
			expect(() => errorHandler("db down")).toThrow();
			expect(consoleError).toHaveBeenCalled();
			expect(consoleInfo).not.toHaveBeenCalled();
			const output = stripAnsi(String(consoleError.mock.calls[0][0]));
			expect(output).toContain("[ERROR]");
			expect(output).toContain("db down");
		});
	});

	describe("successMSG", () => {
		test("uses [OK] prefix (not [INFO]) so success is visually distinct", () => {
			successMSG("deployed");
			expect(consoleInfo).toHaveBeenCalled();
			const output = stripAnsi(String(consoleInfo.mock.calls[0][0]));
			expect(output).toContain("[OK]");
			expect(output).not.toContain("[INFO]");
			expect(output).toContain("deployed");
		});
	});

	describe("infoMSG", () => {
		test("uses [INFO] prefix and keeps writing to stdout (via console.info)", () => {
			infoMSG("env loaded");
			expect(consoleInfo).toHaveBeenCalled();
			const output = stripAnsi(String(consoleInfo.mock.calls[0][0]));
			expect(output).toContain("[INFO]");
			expect(output).toContain("env loaded");
		});
	});

	describe("prefix surface", () => {
		test("does not export questionMSG (unused [PROMPT] helper — YAGNI)", () => {
			expect((messagesModule as Record<string, unknown>).questionMSG).toBeUndefined();
		});
	});
});
