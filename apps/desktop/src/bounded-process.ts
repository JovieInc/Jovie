import {
  type ChildProcess,
  type SpawnOptions,
  spawn,
} from 'node:child_process';

export const DEFAULT_PROCESS_TIMEOUT_MS = 3_000;
export const OPERATOR_SPAWN_TIMEOUT_MS = 2_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

export type BoundedProcessFailureReason =
  | 'missing-executable'
  | 'spawn-failed'
  | 'timeout';

export type BoundedProcessSuccess = {
  readonly ok: true;
  readonly spawned: true;
  readonly completed: boolean;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
};

export type BoundedProcessFailure = {
  readonly ok: false;
  readonly spawned: boolean;
  readonly completed: false;
  readonly reason: BoundedProcessFailureReason;
  readonly message: string;
  readonly stdout: string;
  readonly stderr: string;
};

export type BoundedProcessResult =
  | BoundedProcessSuccess
  | BoundedProcessFailure;

export type BoundedProcessSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => ChildProcess;

export type RunBoundedProcessInput = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly detached?: boolean;
  readonly stdio?: 'ignore' | 'pipe';
  readonly waitForExit?: boolean;
  readonly spawnImpl?: BoundedProcessSpawn;
};

function failureReason(error: unknown): BoundedProcessFailureReason {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  ) {
    return 'missing-executable';
  }
  return 'spawn-failed';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function appendBounded(
  current: string,
  chunk: string,
  maxOutputBytes: number
): string {
  if (current.length >= maxOutputBytes) return current;
  const remaining = maxOutputBytes - current.length;
  return current.length + chunk.length <= maxOutputBytes
    ? current + chunk
    : current + chunk.slice(0, remaining);
}

function killOwned(child: ChildProcess): void {
  if (child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const force = setTimeout(() => {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }, 250);
  force.unref?.();
}

export async function runBoundedProcess(
  input: RunBoundedProcessInput
): Promise<BoundedProcessResult> {
  const args = input.args ?? [];
  const timeoutMs = input.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const maxOutputBytes = input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const waitForExit = input.waitForExit !== false;
  const stdio = input.stdio ?? 'pipe';
  const spawnImpl = input.spawnImpl ?? spawn;

  return new Promise(resolve => {
    let settled = false;
    let spawned = false;
    let stdout = '';
    let stderr = '';
    let child: ChildProcess;
    try {
      child = spawnImpl(input.command, [...args], {
        cwd: input.cwd,
        env: input.env,
        detached: input.detached === true,
        stdio,
      });
    } catch (error) {
      resolve({
        ok: false,
        spawned: false,
        completed: false,
        reason: failureReason(error),
        message: errorMessage(error),
        stdout: '',
        stderr: '',
      });
      return;
    }

    const finish = (result: BoundedProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('error', onError);
      child.removeListener('spawn', onSpawn);
      child.removeListener('close', onClose);
      child.stdout?.removeListener('data', onStdout);
      child.stderr?.removeListener('data', onStderr);
      resolve(result);
    };

    const onStdout = (chunk: Buffer | string) => {
      stdout = appendBounded(stdout, String(chunk), maxOutputBytes);
    };
    const onStderr = (chunk: Buffer | string) => {
      stderr = appendBounded(stderr, String(chunk), maxOutputBytes);
    };
    const onError = (error: Error) => {
      finish({
        ok: false,
        spawned,
        completed: false,
        reason: failureReason(error),
        message: errorMessage(error),
        stdout,
        stderr,
      });
    };
    const onSpawn = () => {
      spawned = true;
      if (input.detached === true) {
        child.unref();
      }
      if (!waitForExit) {
        finish({
          ok: true,
          spawned: true,
          completed: false,
          exitCode: null,
          signal: null,
          stdout,
          stderr,
        });
      }
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      finish({
        ok: true,
        spawned: true,
        completed: true,
        exitCode: code,
        signal,
        stdout,
        stderr,
      });
    };

    child.once('error', onError);
    child.once('spawn', onSpawn);
    if (waitForExit) {
      child.once('close', onClose);
    }
    if (stdio === 'pipe') {
      child.stdout?.on('data', onStdout);
      child.stderr?.on('data', onStderr);
    }

    const timer = setTimeout(() => {
      if (waitForExit || !spawned) {
        killOwned(child);
      }
      finish({
        ok: false,
        spawned,
        completed: false,
        reason: 'timeout',
        message: `timed out after ${timeoutMs}ms`,
        stdout,
        stderr,
      });
    }, timeoutMs);
    timer.unref?.();
  });
}
