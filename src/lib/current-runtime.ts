function detectRuntime(runtimeParam: string) {
  if (runtimeParam.includes("deno")) {
    return "--deno";
  }

  return "--node";
}

export { detectRuntime };
