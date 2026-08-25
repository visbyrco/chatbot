import "server-only";
import { Worker } from "node:worker_threads";
import { PYTHON_WORKER_SOURCE } from "./worker-source";

export const MAX_CODE_LENGTH = 100_000;

const POOL_SIZE = 2;
const MAX_QUEUE_DEPTH = 8;
const EXECUTION_TIMEOUT_MS = 15_000;
const WARMUP_TIMEOUT_MS = 60_000;

export type PythonRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  result?: unknown;
  error?: string;
};

type PendingJob = {
  code: string;
  queued: boolean;
  timer: NodeJS.Timeout | null;
  onAbort: () => void;
  resolve: (value: PythonRunResult) => void;
  signal?: AbortSignal;
};

type PoolWorker = {
  worker: Worker;
  ready: boolean;
  broken: boolean;
  current: PendingJob | null;
};

let pool: PoolWorker[] = [];
const queue: PendingJob[] = [];
let creating = false;

function pruneBrokenWorkers() {
  pool = pool.filter((entry) => !entry.broken);
}

function toErrorResult(error: string): PythonRunResult {
  return { error, ok: false, stderr: "", stdout: "" };
}

function toResult(message: {
  stdout?: string;
  stderr?: string;
  result?: unknown;
  error?: string;
}): PythonRunResult {
  return {
    error: message.error,
    ok: !message.error,
    result: message.result,
    stderr: message.stderr ?? "",
    stdout: message.stdout ?? "",
  };
}

function clearJob(job: PendingJob) {
  job.queued = false;
  if (job.timer) {
    clearTimeout(job.timer);
    job.timer = null;
  }
  if (job.signal && job.onAbort) {
    try {
      job.signal.removeEventListener("abort", job.onAbort);
      // biome-ignore lint/suspicious/noEmptyBlockStatements: ignore
    } catch {}
  }
}

function spawnWorker(): Promise<PoolWorker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(PYTHON_WORKER_SOURCE, {
      env: {},
      eval: true,
      resourceLimits: {
        maxOldGenerationSizeMb: 512,
        maxYoungGenerationSizeMb: 128,
        stackSizeMb: 4,
      },
    });

    const entry: PoolWorker = {
      broken: false,
      current: null,
      ready: false,
      worker,
    };

    const failWorker = (error: Error) => {
      if (entry.broken) {
        return;
      }
      entry.broken = true;
      pruneBrokenWorkers();
      if (!entry.ready) {
        reject(error);
      } else if (entry.current) {
        const job = entry.current;
        entry.current = null;
        clearJob(job);
        job.resolve(toErrorResult(error.message));
        pump();
      }
    };

    const warmupTimer = setTimeout(() => {
      failWorker(new Error("Python runtime failed to warm up."));
      worker.terminate().catch(() => undefined);
    }, WARMUP_TIMEOUT_MS);

    worker.on("message", (message: unknown) => {
      const msg = message as {
        type?: string;
        stdout?: string;
        stderr?: string;
        result?: unknown;
        error?: string;
      };
      if (msg.type === "ready") {
        clearTimeout(warmupTimer);
        entry.ready = true;
        resolve(entry);
      } else if (msg.type === "fatal") {
        clearTimeout(warmupTimer);
        failWorker(new Error(msg.error ?? "Python runtime failed."));
      } else if (msg.type === "done" && entry.current) {
        const job = entry.current;
        entry.current = null;
        clearJob(job);
        job.resolve(toResult(msg));
        pump();
      }
    });

    worker.on("error", (error) => {
      clearTimeout(warmupTimer);
      failWorker(new Error(error.message));
    });

    worker.on("exit", () => {
      clearTimeout(warmupTimer);
      failWorker(new Error("Python worker exited unexpectedly."));
    });
  });
}

async function ensurePool() {
  if (creating) {
    return;
  }
  creating = true;
  try {
    await fillPool();
  } finally {
    creating = false;
  }
}

async function fillPool() {
  if (pool.filter((entry) => !entry.broken).length >= POOL_SIZE) {
    return;
  }
  const created = await spawnWorker();
  pool.push(created);
  await fillPool();
}

function runJob(entry: PoolWorker, job: PendingJob) {
  entry.current = job;
  job.queued = false;
  job.timer = setTimeout(() => {
    entry.broken = true;
    entry.current = null;
    clearJob(job);
    job.resolve(toErrorResult("Python execution timed out."));
    entry.worker.terminate().catch(() => undefined);
    pruneBrokenWorkers();
    pump();
  }, EXECUTION_TIMEOUT_MS);
  entry.worker.postMessage({ code: job.code, type: "run" });
}

function dispatchQueuedJobs() {
  pruneBrokenWorkers();
  for (;;) {
    if (queue.length === 0) {
      return;
    }
    const free = pool.find(
      (entry) => entry.ready && !entry.broken && !entry.current
    );
    if (!free) {
      return;
    }
    const job = queue.shift();
    if (job) {
      runJob(free, job);
    }
  }
}

async function pump() {
  pruneBrokenWorkers();
  dispatchQueuedJobs();

  if (queue.length === 0) {
    return;
  }

  if (pool.filter((entry) => !entry.broken).length >= POOL_SIZE || creating) {
    return;
  }

  try {
    await ensurePool();
  } catch (error) {
    const job = queue.shift();
    if (job) {
      clearJob(job);
      job.resolve(
        toErrorResult(error instanceof Error ? error.message : String(error))
      );
    }
  }

  await pump();
}

function abortJob(job: PendingJob) {
  if (job.queued) {
    const index = queue.indexOf(job);
    if (index !== -1) {
      queue.splice(index, 1);
      clearJob(job);
      job.resolve(toErrorResult("Python execution cancelled."));
      pump();
    }
    return;
  }
  const entry = pool.find((e) => e.current === job);
  if (entry) {
    entry.broken = true;
    entry.current = null;
    clearJob(job);
    job.resolve(toErrorResult("Python execution cancelled."));
    entry.worker.terminate().catch(() => undefined);
    pruneBrokenWorkers();
    pump();
  }
}

export function executePython(
  code: string,
  signal?: AbortSignal
): Promise<PythonRunResult> {
  return new Promise((resolve) => {
    if (queue.length >= MAX_QUEUE_DEPTH) {
      resolve(
        toErrorResult("Too many Python executions queued. Try again shortly.")
      );
      return;
    }

    if (signal?.aborted) {
      resolve(toErrorResult("Python execution cancelled."));
      return;
    }

    let job!: PendingJob;
    const wrappedResolve = (value: PythonRunResult) => {
      if (job?.signal && job.onAbort) {
        try {
          job.signal.removeEventListener("abort", job.onAbort);
          // biome-ignore lint/suspicious/noEmptyBlockStatements: ignore
        } catch {}
      }
      resolve(value);
    };

    job = {
      code,
      onAbort: () => abortJob(job),
      queued: true,
      resolve: wrappedResolve,
      signal,
      timer: null,
    };

    signal?.addEventListener("abort", job.onAbort, { once: true });
    queue.push(job);
    pump().catch(() => undefined);
  });
}
