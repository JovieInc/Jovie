// Pure status + read-state helpers for sidebar chat rows (JOV-14005 A lock).

export type ThreadStatus = 'running' | 'complete' | 'errored';
export const THREAD_READ_STORAGE_KEY = 'jovie:sidebar-thread-read-at';

const IN_PROGRESS_CHAT_TURN_STATUSES = new Set([
  'reserved',
  'running',
  'streaming',
]);
const FAILED_CHAT_TURN_STATUSES = new Set([
  'failed_tool_unavailable',
  'failed_model_error',
  'failed_timeout',
  'failed_network',
]);

export function getSidebarThreadStatus(
  latestTurnStatus: string | null | undefined
): ThreadStatus {
  if (!latestTurnStatus) {
    return 'complete';
  }

  if (IN_PROGRESS_CHAT_TURN_STATUSES.has(latestTurnStatus)) {
    return 'running';
  }

  if (FAILED_CHAT_TURN_STATUSES.has(latestTurnStatus)) {
    return 'errored';
  }

  return 'complete';
}

// Decision-affecting status belongs in the accessible name so the semantic
// micro-dot is never the only cue (Tim lock 2026-11-23, option A).
export function getSidebarThreadAccessibleStatus(
  status: ThreadStatus,
  unread: boolean
): string | null {
  if (status === 'running') return 'Running';
  if (status === 'errored') return 'Error';
  if (unread) return 'Unread';
  return null;
}

export function readThreadReadState(): Record<string, string> {
  try {
    const stored = globalThis.localStorage?.getItem(THREAD_READ_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}

export function writeThreadReadState(value: Record<string, string>): void {
  try {
    globalThis.localStorage?.setItem(
      THREAD_READ_STORAGE_KEY,
      JSON.stringify(value)
    );
  } catch {
    // Storage can be unavailable in restricted browsers; row state still works.
  }
}

export function isTimestampAfter(
  candidate: string | null | undefined,
  baseline: string | null | undefined
): boolean {
  if (!candidate) return false;
  if (!baseline) return true;
  const candidateMs = Date.parse(candidate);
  const baselineMs = Date.parse(baseline);
  return Number.isFinite(candidateMs) && Number.isFinite(baselineMs)
    ? candidateMs > baselineMs
    : candidate > baseline;
}
