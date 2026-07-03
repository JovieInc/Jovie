/**
 * macOS spawn pressure helpers — EAGAIN / "resource temporarily unavailable"
 * must not fatal the codex issue shipper when fork/file-descriptor limits bite.
 */

export class SpawnResourceUnavailableError extends Error {
  readonly command: string;

  constructor(command: string, cause: unknown) {
    const detail =
      cause instanceof Error ? cause.message : String(cause ?? 'unknown');
    super(`spawnSync ${command} EAGAIN: ${detail}`);
    this.name = 'SpawnResourceUnavailableError';
    this.command = command;
  }
}

export function isSpawnResourceUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  if (
    message.includes('eagain') ||
    message.includes('resource temporarily unavailable')
  ) {
    return true;
  }
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EAGAIN' || code === 'EBUSY';
}

export interface SpawnEagainTrackerOptions {
  readonly threshold?: number;
  readonly backoffMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Tracks consecutive spawn-pressure failures and applies a long pause. */
export class SpawnEagainTracker {
  private consecutive = 0;
  private readonly threshold: number;
  private readonly backoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: SpawnEagainTrackerOptions = {}) {
    this.threshold = options.threshold ?? 3;
    this.backoffMs = options.backoffMs ?? 60_000;
    this.sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  }

  get consecutiveCount(): number {
    return this.consecutive;
  }

  record(command: string): number {
    this.consecutive += 1;
    return this.consecutive;
  }

  reset(): void {
    this.consecutive = 0;
  }

  async maybeBackoff(): Promise<boolean> {
    if (this.consecutive < this.threshold) return false;
    await this.sleep(this.backoffMs);
    this.consecutive = 0;
    return true;
  }
}