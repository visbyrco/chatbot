"use client";

const PYODIDE_SCRIPT_URL =
  "https://cdn.jsdelivr.net/pyodide/v0.28.2/full/pyodide.js";
const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.28.2/full/";

type PyodideInstance = {
  loadPackagesFromImports: (
    code: string,
    options: { messageCallback: (message: string) => void }
  ) => Promise<unknown>;
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (options: { batched: (output: string) => void }) => void;
};

type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideInstance>;

declare global {
  interface Window {
    loadPyodide?: LoadPyodide;
  }
}

let loadPromise: Promise<PyodideInstance> | null = null;

export function loadPyodideRuntime(): Promise<PyodideInstance> {
  if (!loadPromise) {
    loadPromise = loadPyodide().catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
  }

  return loadPromise;
}

async function loadPyodide(): Promise<PyodideInstance> {
  if (typeof window.loadPyodide !== "function") {
    await loadPyodideScript();
  }

  const loader = window.loadPyodide;
  if (!loader) {
    throw new Error("Pyodide runtime failed to initialize.");
  }

  return loader({ indexURL: PYODIDE_INDEX_URL });
}

function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = PYODIDE_SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Pyodide runtime failed to load."));
    document.head.appendChild(script);
  });
}
