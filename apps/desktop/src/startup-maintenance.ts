// Bounded scheduling defaults, not measured startup-performance targets.
export const STARTUP_MAINTENANCE_SETTLE_MS = 2_000;
export const STARTUP_MAINTENANCE_DEADLINE_MS = 30_000;

type MaintenanceTask = 'update-check' | 'web-build-check';

/** Defer only initial automatic work; explicit user actions bypass this gate. */
export function createStartupMaintenanceGate() {
  const pending = new Map<MaintenanceTask, () => void>();
  let released = false;
  let disposed = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  const release = () => {
    if (released || disposed) return;
    released = true;
    clearTimeout(deadlineTimer);
    if (settleTimer !== null) clearTimeout(settleTimer);
    const tasks = [...pending.values()];
    pending.clear();
    for (const task of tasks) task();
  };
  // Sign-in, non-chat, recovery and older hosted clients may never report a
  // usable composer. They must still receive automatic maintenance.
  const deadlineTimer = setTimeout(release, STARTUP_MAINTENANCE_DEADLINE_MS);
  deadlineTimer.unref?.();

  return {
    request(task: MaintenanceTask, run: () => void): void {
      if (disposed) return;
      if (released) run();
      else pending.set(task, run);
    },
    cancelPending(task: MaintenanceTask): void {
      pending.delete(task);
    },
    composerUsable(): void {
      if (released || disposed || settleTimer !== null) return;
      settleTimer = setTimeout(release, STARTUP_MAINTENANCE_SETTLE_MS);
      settleTimer.unref?.();
    },
    dispose(): void {
      disposed = true;
      clearTimeout(deadlineTimer);
      if (settleTimer !== null) clearTimeout(settleTimer);
      pending.clear();
    },
  };
}
