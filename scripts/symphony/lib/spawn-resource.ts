/**
 * Guards against macOS spawn resource exhaustion (EAGAIN / EMFILE / ENOMEM).
 * Used by codex-issue-shipper so one failed `gh` spawn does not fatal the job.
 */

export const DEFAULT_SPAWN_EAGAIN_THRESHOLD = 3;
export const DEFAULT_SPAWN_EAGAIN_BACKOFF_MS = 60_000;

export class SpawnResourceUnavailableError extends Error {
  readonly command: string;
  readonly cause: unknown;

  constructor(command: string, cause: unknown) {
    const detail =
      cause instanceof Error ? cause.message : String(cause ?? 'unknown');
    super(`spawn resource unavailable for ${command}: ${detail}`);
    this.name = 'SpawnResourceUnavailableError';
    this.command = command;
    this.cause = cause;
  }
}

export function isSpawnResourceUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EAGAIN' || code === 'EMFILE' || code === 'ENOMEM') {
    return true;
  }

  const message = err.message;
  return (
    /\bEAGAIN\b/.test(message) ||
    /\bEMFILE\b/.test(message) ||
    /\bENOMEM\b/.test(message) ||
    /resource temporarily unavailable/i.test(message)
  );
}

export interface SpawnResourceGuardOptions {
  readonly threshold?: number;
  readonly backoffMs?: number;
  readonly onEvent?: (entry: Record<string, unknown>) => void;
}

export class SpawnResourceGuard {
  private consecutive = 0;
  private readonly threshold: number;
  private readonly backoffMs: number;
  private readonly onEvent: (entry: Record<string, unknown>) => void;

  constructor(options: SpawnResourceGuardOptions = {}) {
    this.threshold = options.threshold ?? DEFAULT_SPAWN_EAGAIN_THRESHOLD;
    this.backoffMs = options.backoffMs ?? DEFAULT_SPAWN_EAGAIN_BACKOFF_MS;
    this.onEvent = options.onEvent ?? (() => {});
  }

  get consecutiveFailures(): number {
    return this.consecutive;
  }

  recordFailure(command: string, err: unknown): void {
    this.consecutive += 1;
    this.onEvent({
      event: 'gh_eagain_skip',
      command,
      consecutive: this.consecutive,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  recordSuccess(): void {
    this.consecutive = 0;
  }

  async maybeBackoff(): Promise<void> {
    if (this.consecutive < this.threshold) return;

    this.onEvent({
      event: 'gh_eagain_backoff',
      consecutive: this.consecutive,
      backoffMs: this.backoffMs,
    });
    await new Promise(resolve => setTimeout(resolve, this.backoffMs));
    this.consecutive = 0;
  }
}
