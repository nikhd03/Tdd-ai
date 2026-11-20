// import type { TestFileContent, TestFileInfo, TestFileListResponse } from "./types";

// /** Base URL of the VM server (ngrok), without trailing slash. */
// export const VM_API_URL = (process.env.NEXT_PUBLIC_VM_API_URL ?? "").replace(/\/+$/, "");

// /** Required on every request to a free ngrok domain, or ngrok returns an HTML warning page. */
// export const NGROK_HEADERS: Record<string, string> = {
//   "ngrok-skip-browser-warning": "true",
// };

// export class ApiError extends Error {
//   constructor(message: string, public readonly status?: number) {
//     super(message);
//     this.name = "ApiError";
//   }
// }

// const DEFAULT_TIMEOUT_MS = 20_000;

// async function request(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
//   if (!VM_API_URL) {
//     throw new ApiError("NEXT_PUBLIC_VM_API_URL is not set. Add it to .env.local and restart the dev server.");
//   }

//   const controller = new AbortController();
//   const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
//   // Chain an external abort signal (e.g. component unmount) to our controller
//   const external = init.signal;
//   const onExternalAbort = () => controller.abort(external?.reason);
//   external?.addEventListener("abort", onExternalAbort, { once: true });

//   try {
//     const res = await fetch(`${VM_API_URL}${path}`, {
//       ...init,
//       cache: "no-store",
//       headers: { ...NGROK_HEADERS, ...(init.headers as Record<string, string> | undefined) },
//       signal: controller.signal,
//     });
//     if (!res.ok) throw new ApiError(await extractError(res), res.status);
//     return res;
//   } catch (err) {
//     if (err instanceof ApiError) throw err;
//     if (err instanceof DOMException && (err.name === "TimeoutError" || controller.signal.reason?.name === "TimeoutError")) {
//       throw new ApiError(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Is the VM / ngrok tunnel running?`);
//     }
//     if (err instanceof DOMException && err.name === "AbortError") throw err;
//     throw new ApiError(
//       "Could not reach the VM server. Check that the server and ngrok tunnel are running and that CORS allows this origin.",
//     );
//   } finally {
//     clearTimeout(timer);
//     external?.removeEventListener("abort", onExternalAbort);
//   }
// }

// async function extractError(res: Response): Promise<string> {
//   const type = res.headers.get("content-type") ?? "";
//   try {
//     if (type.includes("application/json")) {
//       const data = (await res.json()) as { error?: string; message?: string };
//       return data.error ?? data.message ?? `Request failed (${res.status})`;
//     }
//     const text = await res.text();
//     if (type.includes("text/html")) {
//       return res.status === 404
//         ? "Endpoint not found on the VM (404). Is the tunnel pointing at the right server?"
//         : `The VM returned an HTML page (${res.status}). The ngrok tunnel may be offline.`;
//     }
//     return text.slice(0, 300) || `Request failed (${res.status})`;
//   } catch {
//     return `Request failed (${res.status})`;
//   }
// }

// async function parseJson<T>(res: Response): Promise<T> {
//   const type = res.headers.get("content-type") ?? "";
//   if (!type.includes("application/json")) {
//     throw new ApiError("Unexpected response from VM (not JSON). The ngrok warning page may be intercepting requests.");
//   }
//   return (await res.json()) as T;
// }

// export async function listTestFiles(signal?: AbortSignal): Promise<TestFileInfo[]> {
//   const res = await request("/api/tests", { signal });
//   const data = await parseJson<TestFileListResponse | TestFileInfo[]>(res);
//   const files = Array.isArray(data) ? data : Array.isArray(data.files) ? data.files : [];
//   return [...files].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
// }

// export async function getTestFile(filename: string, signal?: AbortSignal): Promise<TestFileContent> {
//   const res = await request(`/api/tests/${encodeURIComponent(filename)}`, { signal });
//   const data = await parseJson<TestFileContent>(res);
//   if (typeof data.content !== "string") throw new ApiError("Malformed file response from VM.");
//   return data;
// }

// /** Downloads through fetch (so the ngrok header is sent) and saves via a Blob link. */
// export async function downloadTestFile(filename: string): Promise<void> {
//   const res = await request(`/api/tests/${encodeURIComponent(filename)}/download`, {}, 120_000);
//   const blob = await res.blob();
//   saveBlob(blob, filename);
// }

// export function saveBlob(blob: Blob, filename: string): void {
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;
//   a.download = filename;
//   a.rel = "noopener";
//   document.body.appendChild(a);
//   a.click();
//   a.remove();
//   setTimeout(() => URL.revokeObjectURL(url), 1000);
// }


import type { TestFileContent, TestFileInfo, TestFileListResponse } from "./types";

/** Base URL of the VM server (ngrok), without trailing slash. */
export const VM_API_URL = (process.env.NEXT_PUBLIC_VM_API_URL ?? "").replace(/\/+$/, "");

/** Required on every request to a free ngrok domain, or ngrok returns an HTML warning page. */
export const NGROK_HEADERS: Record<string, string> = {
  "ngrok-skip-browser-warning": "true",
};

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

function mergeHeaders(base: Record<string, string>, extra?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (!extra) return headers;

  if (extra instanceof Headers) {
    extra.forEach((value, key) => headers.set(key, value));
  } else if (Array.isArray(extra)) {
    for (const [key, value] of extra) headers.set(key, value);
  } else {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) headers.set(key, String(value));
    }
  }
  return headers;
}

async function request(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  if (!VM_API_URL) {
    throw new ApiError("NEXT_PUBLIC_VM_API_URL is not set. Add it to .env.local and restart the dev server.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
  // Chain an external abort signal (e.g. component unmount) to our controller
  const external = init.signal;
  const onExternalAbort = () => controller.abort(external?.reason);
  external?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const res = await fetch(`${VM_API_URL}${path}`, {
      ...init,
      mode: init.mode ?? "cors",
      cache: "no-store",
      headers: mergeHeaders(NGROK_HEADERS, init.headers),
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(await extractError(res), res.status);
    return res;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && (err.name === "TimeoutError" || controller.signal.reason?.name === "TimeoutError")) {
      throw new ApiError(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Is the VM / ngrok tunnel running?`);
    }
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      "Could not reach the VM server. Check that the server and ngrok tunnel are running and that CORS allows this origin.",
    );
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

async function extractError(res: Response): Promise<string> {
  const type = res.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const data = (await res.json()) as { error?: string; message?: string };
      return data.error ?? data.message ?? `Request failed (${res.status})`;
    }
    const text = await res.text();
    if (type.includes("text/html")) {
      return res.status === 404
        ? "Endpoint not found on the VM (404). Is the tunnel pointing at the right server?"
        : `The VM returned an HTML page (${res.status}). The ngrok tunnel may be offline.`;
    }
    return text.slice(0, 300) || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new ApiError("Unexpected response from VM (not JSON). The ngrok warning page may be intercepting requests.");
  }
  return (await res.json()) as T;
}

export async function listTestFiles(signal?: AbortSignal): Promise<TestFileInfo[]> {
  const res = await request("/api/tests", { signal });
  const data = await parseJson<TestFileListResponse | TestFileInfo[]>(res);
  const files = Array.isArray(data) ? data : Array.isArray(data.files) ? data.files : [];
  return [...files].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getTestFile(filename: string, signal?: AbortSignal): Promise<TestFileContent> {
  const res = await request(`/api/tests/${encodeURIComponent(filename)}`, { signal });
  const data = await parseJson<TestFileContent>(res);
  if (typeof data.content !== "string") throw new ApiError("Malformed file response from VM.");
  return data;
}

/** Downloads through fetch (so the ngrok header is sent) and saves via a Blob link. */
export async function downloadTestFile(filename: string): Promise<void> {
  const res = await request(`/api/tests/${encodeURIComponent(filename)}/download`, {}, 120_000);
  const blob = await res.blob();
  saveBlob(blob, filename);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
