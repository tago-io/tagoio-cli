import { vi, type Mock } from "vitest";

/**
 * Installs a `global.fetch` spy backed by `vi.fn()` and returns the spy so tests can queue
 * per-call responses. Use `mockResolvedValueOnce(makeFetchResponse({ result: [] }))` for
 * JSON bodies, `makeFetchArrayBufferResponse(buf)` for ArrayBuffer bodies, and
 * `makeFetchStreamResponse(readable)` for streamed bodies.
 */
function installFetchMock(): Mock {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Builds a fetch-compatible Response-like object with a JSON body. */
function makeFetchResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    body: null,
  } as unknown as Response;
}

/** Builds a fetch-compatible Response-like object with an ArrayBuffer body. */
function makeFetchArrayBufferResponse(buffer: ArrayBuffer | Buffer): Response {
  const ab = Buffer.isBuffer(buffer) ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => ab,
    json: async () => {
      throw new Error("not json");
    },
    body: null,
  } as unknown as Response;
}

/** Builds a fetch-compatible Response-like object with a streamed body (Web ReadableStream). */
function makeFetchStreamResponse(readable: ReadableStream | null, init: { ok?: boolean; status?: number } = {}): Response {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    body: readable,
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

export { installFetchMock, makeFetchResponse, makeFetchArrayBufferResponse, makeFetchStreamResponse };
