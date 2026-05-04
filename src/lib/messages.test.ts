import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import * as messagesModule from "./messages.js";
import { errorHandler, errorHandlerJSON, infoMSG, requireOrFail, successMSG } from "./messages.js";

// kleur emits ANSI escape codes; strip them so assertions match plain text.
// oxlint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\u001B\[[0-9;]*m/g, "");

describe("messages", () => {
	let stdoutWrite: ReturnType<typeof vi.spyOn>;
	let stderrWrite: ReturnType<typeof vi.spyOn>;
	let exit: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
			throw new Error(`__exit:${code}`);
		}) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const lastStderr = () => stripAnsi(String(stderrWrite.mock.calls[stderrWrite.mock.calls.length - 1][0]));

	describe("errorHandler", () => {
		test("exits with code 1 so the OS/shell/CI treats the run as failed", () => {
			expect(() => errorHandler("something broke")).toThrow("__exit:1");
			expect(exit).toHaveBeenCalledWith(1);
		});

		test("writes the error message to stderr, not stdout (clig.dev: errors go to stderr)", () => {
			expect(() => errorHandler("db down")).toThrow();
			expect(stderrWrite).toHaveBeenCalled();
			expect(stdoutWrite).not.toHaveBeenCalled();
			const output = lastStderr();
			expect(output).toContain("[ERROR]");
			expect(output).toContain("db down");
		});
	});

	describe("successMSG", () => {
		test("uses [OK] prefix and writes to stderr (clig.dev: only data on stdout)", () => {
			successMSG("deployed");
			expect(stderrWrite).toHaveBeenCalled();
			expect(stdoutWrite).not.toHaveBeenCalled();
			const output = lastStderr();
			expect(output).toContain("[OK]");
			expect(output).not.toContain("[INFO]");
			expect(output).toContain("deployed");
		});
	});

	describe("infoMSG", () => {
		test("uses [INFO] prefix and writes to stderr (clig.dev: status goes to stderr)", () => {
			infoMSG("env loaded");
			expect(stderrWrite).toHaveBeenCalled();
			expect(stdoutWrite).not.toHaveBeenCalled();
			const output = lastStderr();
			expect(output).toContain("[INFO]");
			expect(output).toContain("env loaded");
		});
	});

	describe("prefix surface", () => {
		test("does not export questionMSG (unused [PROMPT] helper — YAGNI)", () => {
			expect((messagesModule as Record<string, unknown>).questionMSG).toBeUndefined();
		});
	});

	describe("errorHandlerJSON", () => {
		test("writes a parseable JSON object to stderr and exits 1", () => {
			expect(() => errorHandlerJSON("entity not found", "not_found")).toThrow("__exit:1");
			expect(exit).toHaveBeenCalledWith(1);
			expect(stderrWrite).toHaveBeenCalled();
			expect(stdoutWrite).not.toHaveBeenCalled();
			const raw = String(stderrWrite.mock.calls[stderrWrite.mock.calls.length - 1][0]);
			const parsed = JSON.parse(raw);
			expect(parsed).toEqual({ error: "entity not found", code: "not_found" });
		});

		test("omits the code key when no code is provided", () => {
			expect(() => errorHandlerJSON("plain failure")).toThrow("__exit:1");
			const raw = String(stderrWrite.mock.calls[stderrWrite.mock.calls.length - 1][0]);
			const parsed = JSON.parse(raw);
			expect(parsed).toEqual({ error: "plain failure" });
			expect(parsed.code).toBeUndefined();
		});
	});

	describe("requireOrFail", () => {
		test("returns the value as-is when one is provided (no prompt, no error)", async () => {
			const result = await requireOrFail("preset", "id");
			expect(result).toBe("preset");
			expect(exit).not.toHaveBeenCalled();
			expect(stderrWrite).not.toHaveBeenCalled();
		});

		test("silent + missing → errors with [ERROR] Missing required input: <name>", async () => {
			await expect(requireOrFail(undefined, "entity-id", { silent: true })).rejects.toThrow("__exit:1");
			expect(exit).toHaveBeenCalledWith(1);
			const output = lastStderr();
			expect(output).toContain("[ERROR]");
			expect(output).toContain("Missing required input: entity-id");
		});

		test("silent + json + missing → errors with a parseable JSON object on stderr", async () => {
			await expect(requireOrFail(undefined, "entity-id", { silent: true, json: true })).rejects.toThrow("__exit:1");
			const raw = String(stderrWrite.mock.calls[stderrWrite.mock.calls.length - 1][0]);
			const parsed = JSON.parse(raw);
			expect(parsed).toEqual({ error: "Missing required input: entity-id", code: "missing_input" });
		});

		test("interactive mode prompts the user and returns the answer when provided", async () => {
			prompts.inject(["picked-by-prompt"]);
			const result = await requireOrFail(undefined, "entity-id", { promptMessage: "Enter entity id:" });
			expect(result).toBe("picked-by-prompt");
			expect(exit).not.toHaveBeenCalled();
		});

		test("interactive mode + cancelled prompt → errors instead of returning empty", async () => {
			prompts.inject([""]);
			await expect(requireOrFail(undefined, "entity-id")).rejects.toThrow("__exit:1");
			const output = lastStderr();
			expect(output).toContain("[ERROR]");
			expect(output).toContain("Missing required input: entity-id");
		});
	});
});
