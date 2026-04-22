import prompts from "prompts";

type PromptsWithInjected = { _injected?: unknown[] };

/**
 * `prompts.inject()` appends to a module-global queue with no public reset API.
 * Leftover injects from a prior test leak into the current one when multiple tests
 * in the same file use `inject()`. Call this between tests to clear the queue.
 */
function resetInjectedPrompts() {
  (prompts as unknown as PromptsWithInjected)._injected = undefined;
}

export { resetInjectedPrompts };
