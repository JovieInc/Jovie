/** The renderer owns work; hiding its window does not finish that work. */
export interface SessionWorkState {
  readonly hasDraft: boolean;
  readonly isStreaming: boolean;
  readonly isUploading: boolean;
  readonly hasPendingAction: boolean;
  readonly isAuthenticating: boolean;
}

export interface SessionWorkSnapshot {
  readonly state: SessionWorkState;
  readonly reportedAt: number;
}

export const SESSION_WORK_STATE_MAX_AGE_MS = 30_000;
export const SESSION_WORK_PROBE_TIMEOUT_MS = 2_000;

const WORK_FLAGS = [
  'hasDraft',
  'isStreaming',
  'isUploading',
  'hasPendingAction',
  'isAuthenticating',
] as const;

export function isSessionWorkState(value: unknown): value is SessionWorkState {
  return (
    value !== null &&
    typeof value === 'object' &&
    WORK_FLAGS.every(
      key => typeof (value as SessionWorkState)[key] === 'boolean'
    )
  );
}

/** Both unattended reload and restart use this fail-closed policy. */
export function isSessionWorkSafe(input: {
  readonly snapshot: unknown;
  readonly now: number;
  readonly isAuthenticating: boolean;
}): boolean {
  if (input.isAuthenticating) return false;
  if (!input.snapshot || typeof input.snapshot !== 'object') return false;
  const snapshot = input.snapshot as SessionWorkSnapshot;
  if (!isSessionWorkState(snapshot.state)) return false;
  const age = input.now - snapshot.reportedAt;
  return (
    Number.isFinite(snapshot.reportedAt) &&
    age >= 0 &&
    age < SESSION_WORK_STATE_MAX_AGE_MS &&
    WORK_FLAGS.every(key => !snapshot.state[key])
  );
}

/** A new preload instance starts unknown; invalid reports revoke idle evidence. */
export function createSessionWorkReporter(now: () => number = Date.now) {
  let snapshot: SessionWorkSnapshot | null = null;
  return {
    report(state: unknown): void {
      snapshot = isSessionWorkState(state)
        ? { state: { ...state }, reportedAt: now() }
        : null;
    },
    read(): SessionWorkSnapshot | null {
      return snapshot;
    },
  };
}

/** Do not trust idle evidence from a document that navigated while IPC awaited. */
export async function probeSessionWorkSafety(input: {
  readonly read: () => Promise<unknown>;
  readonly isCurrentDocument: () => boolean;
  readonly isAuthenticating: () => boolean;
  readonly now: () => number;
}): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const probe = await Promise.race([
      input.read(),
      new Promise<null>(resolve => {
        timeout = setTimeout(
          () => resolve(null),
          SESSION_WORK_PROBE_TIMEOUT_MS
        );
      }),
    ]);
    if (!input.isCurrentDocument() || !probe || typeof probe !== 'object') {
      return false;
    }
    const evidence = probe as { snapshot?: unknown; hasUnsentInput?: unknown };
    return (
      evidence.hasUnsentInput === false &&
      isSessionWorkSafe({
        snapshot: evidence.snapshot,
        now: input.now(),
        isAuthenticating: input.isAuthenticating(),
      })
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Revalidate every document together after the slowest window answers. */
export async function probeAllWindowWorkSafety<Window>(input: {
  readonly getWindows: () => readonly Window[];
  readonly getGeneration: (window: Window) => number | undefined;
  readonly isLoading: (window: Window) => boolean;
  readonly probe: (window: Window) => Promise<boolean>;
  readonly isAuthenticating: () => boolean;
}): Promise<boolean> {
  if (input.isAuthenticating()) return false;
  const windows = input.getWindows();
  const generations = new Map(
    windows.map(window => [window, input.getGeneration(window)])
  );
  const results = await Promise.all(windows.map(input.probe));
  const currentWindows = input.getWindows();
  return (
    !input.isAuthenticating() &&
    results.every(Boolean) &&
    currentWindows.length === windows.length &&
    currentWindows.every(
      window =>
        generations.has(window) &&
        generations.get(window) === input.getGeneration(window) &&
        !input.isLoading(window)
    )
  );
}

/** Wake, unlock and interval triggers share one complete check/reload cycle. */
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(task)
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };
}
