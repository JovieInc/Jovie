/**
 * Pure scheduling for the Cloudflare cron hub. Interval based with a per-task
 * last-run record (not minute-modulo), so a skipped platform cron tick is
 * caught up on the next tick instead of silently dropping an hourly task.
 */
export type Task = {
  id: string;
  /** Run at most this often. */
  everyMin: number;
  /** Absolute URL that accepts `POST` with `Authorization: Bearer <secret>`. */
  url: string;
  /** Disabled tasks are listed for the inventory but never dispatched. */
  enabled: boolean;
  /** Which secret binding authenticates the dispatch. */
  secret: string;
};

export type TaskState = {
  lastRunAt: number | null;
  lastOkAt: number | null;
  failures: number;
};

export const EMPTY_STATE: TaskState = {
  lastRunAt: null,
  lastOkAt: null,
  failures: 0,
};

/** Grace so jitter in the platform tick never skips a whole interval. */
const SLACK_MS = 15_000;

export function isDue(task: Task, state: TaskState, now: number): boolean {
  if (!task.enabled) return false;
  if (state.lastRunAt === null) return true;
  return now - state.lastRunAt >= task.everyMin * 60_000 - SLACK_MS;
}

export function dueTasks(
  tasks: readonly Task[],
  states: Record<string, TaskState>,
  now: number
): Task[] {
  return tasks.filter(task => isDue(task, states[task.id] ?? EMPTY_STATE, now));
}

/** A task is overdue when it should have succeeded 3 intervals ago and has not. */
export function overdue(
  tasks: readonly Task[],
  states: Record<string, TaskState>,
  now: number
): string[] {
  return tasks
    .filter(task => task.enabled)
    .filter(task => {
      const ok = (states[task.id] ?? EMPTY_STATE).lastOkAt;
      return ok === null || now - ok > 3 * task.everyMin * 60_000 + 60_000;
    })
    .map(task => task.id);
}

export function afterRun(
  state: TaskState,
  ok: boolean,
  now: number
): TaskState {
  return {
    lastRunAt: now,
    lastOkAt: ok ? now : state.lastOkAt,
    failures: ok ? 0 : state.failures + 1,
  };
}
