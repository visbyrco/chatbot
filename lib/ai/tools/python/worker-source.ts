// Sandboxed Python execution worker.
// Runs Pyodide (CPython compiled to WebAssembly) inside a Node worker thread.
// The source is embedded as a string and spawned with `{ eval: true }` so the
// standalone output never has to resolve a worker file. Do not use backticks
// inside the worker source string.
export const PYTHON_WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const exit =
  typeof process !== "undefined" && typeof process.exit === "function"
    ? process.exit.bind(process)
    : () => {};

const ALLOWED_PACKAGES = ["numpy", "sympy", "scipy", "pandas", "matplotlib"];
const PYODIDE_CDN_HOST = "cdn.jsdelivr.net";
const MAX_OUTPUT_LENGTH = 32000;

let buffers = { stdout: "", stderr: "" };
let pyodide;

function pushOutput(kind, text) {
  if (buffers[kind].length >= MAX_OUTPUT_LENGTH) {
    return;
  }
  buffers[kind] = (buffers[kind] + text).slice(-MAX_OUTPUT_LENGTH);
}

async function init() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let url;
    try {
      url = new URL(String(input));
    } catch {
      return Promise.reject(new Error("Network access is disabled."));
    }
    if (
      url.hostname === PYODIDE_CDN_HOST &&
      url.pathname.startsWith("/pyodide/")
    ) {
      return realFetch(input, init);
    }
    return Promise.reject(
      new Error("Network access is restricted to the Pyodide CDN.")
    );
  };

  const { loadPyodide } = require("pyodide");
  pyodide = await loadPyodide();

  pyodide.setStdout({ batched: (text) => pushOutput("stdout", text) });
  pyodide.setStderr({ batched: (text) => pushOutput("stderr", text) });

  try {
    await pyodide.loadPackage(ALLOWED_PACKAGES);
  } catch (e) {
    pushOutput("stderr", String(e && e.message ? e.message : e));
  }

  if (typeof pyodide.setJsNamespace === "function") {
    pyodide.setJsNamespace({});
  }
  const blockedGlobals = [
    "process",
    "require",
    "module",
    "exports",
    "Buffer",
    "global",
    "navigator",
    "location",
    "performance",
    "postMessage",
    "MessageChannel",
    "MessagePort",
    "WebSocket",
    "XMLHttpRequest",
    "Worker",
    "fetch",
  ];
  for (const key of blockedGlobals) {
    try {
      delete globalThis[key];
    } catch {
      try {
        Object.defineProperty(globalThis, key, {
          value: undefined,
          configurable: true,
        });
      } catch {
        // ignore globals that cannot be removed
      }
    }
  }

  parentPort.postMessage({ type: "ready" });
}

function isSafeResult(value) {
  if (value === null || value === undefined) {
    return true;
  }
  const type = typeof value;
  return (
    type === "number" ||
    type === "string" ||
    type === "boolean" ||
    type === "bigint"
  );
}

function toSafeResult(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

parentPort.on("message", async (msg) => {
  if (msg.type !== "run") {
    return;
  }
  buffers = { stdout: "", stderr: "" };
  try {
    const result = await pyodide.runPythonAsync(msg.code);
    parentPort.postMessage({
      type: "done",
      stdout: buffers.stdout,
      stderr: buffers.stderr,
      result: isSafeResult(result) ? toSafeResult(result) : undefined,
    });
  } catch (error) {
    parentPort.postMessage({
      type: "done",
      stdout: buffers.stdout,
      stderr: buffers.stderr,
      error: String(error && error.message ? error.message : error),
    });
  }
});

init().catch((error) => {
  parentPort.postMessage({
    type: "fatal",
    error: String(error && error.message ? error.message : error),
  });
  exit(1);
});
`;
