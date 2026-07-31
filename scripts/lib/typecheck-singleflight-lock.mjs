/**
 * Pure lock-recovery decisions for typecheck singleflight.
 *
 * Invariant: a live owner is never replaced solely because wall time exceeds
 * the stale window. Age recovers only when owner liveness cannot be established
 * (missing/invalid pid) or the lock payload is corrupt/unreadable. Dead owners
 * are reclaimed immediately.
 */

/**
 * @typedef {object} LockRecovery
 * @property {boolean} recoverable
 * @property {string | null} reason
 * @property {number} ageMs
 * @property {number | null} pid
 * @property {string | null} cwd
 * @property {string[] | null} command
 */

/**
 * @param {unknown} lock
 * @param {{
 *   readonly nowMs?: number;
 *   readonly staleMs: number;
 *   readonly lockFileAgeMs: number;
 *   readonly isProcessAlive: (pid: number) => boolean;
 * }} options
 * @returns {LockRecovery}
 */
export function evaluateLockRecovery(lock, options) {
  const nowMs = options.nowMs ?? Date.now();
  const staleMs = options.staleMs;

  if (!lock || typeof lock !== 'object') {
    const ageMs = Math.max(0, options.lockFileAgeMs);
    // Bound corrupt/missing-payload recovery so a half-written lock cannot
    // block the worktree forever, without waiting the full stale window.
    const boundMs = Math.min(staleMs, 5000);
    if (ageMs > boundMs) {
      return {
        recoverable: true,
        reason: 'corrupt-or-unreadable-lock',
        ageMs,
        pid: null,
        cwd: null,
        command: null,
      };
    }
    return {
      recoverable: false,
      reason: null,
      ageMs,
      pid: null,
      cwd: null,
      command: null,
    };
  }

  const record = /** @type {Record<string, unknown>} */ (lock);
  const pid = normalizePid(record.pid);
  const ageMs = computeLockAgeMs(record, nowMs, options.lockFileAgeMs);
  const meta = {
    ageMs,
    pid,
    cwd: typeof record.cwd === 'string' ? record.cwd : null,
    command: Array.isArray(record.command) ? record.command.map(String) : null,
  };

  if (pid !== null) {
    // Live owner is authoritative. Long typechecks routinely exceed the stale
    // threshold under host pressure; age alone must never permit a second owner.
    if (options.isProcessAlive(pid)) {
      return { recoverable: false, reason: null, ...meta };
    }
    return { recoverable: true, reason: 'dead-owner', ...meta };
  }

  // No usable pid → liveness cannot be established; only then may age recover.
  if (ageMs > staleMs) {
    return { recoverable: true, reason: 'missing-pid-stale-by-age', ...meta };
  }
  return { recoverable: false, reason: null, ...meta };
}

/**
 * @param {Record<string, unknown>} lock
 * @param {number} nowMs
 * @param {number} lockFileAgeMs
 */
export function computeLockAgeMs(lock, nowMs, lockFileAgeMs) {
  const startedAtMs = Number(lock.startedAtMs);
  if (Number.isFinite(startedAtMs) && startedAtMs > 0) {
    return Math.max(0, nowMs - startedAtMs);
  }
  // Missing/corrupt startedAtMs: fall back to lock file mtime so recovery
  // stays bounded instead of treating age as NaN/never-stale.
  return Math.max(0, lockFileAgeMs);
}

/**
 * @param {unknown} pid
 * @returns {number | null}
 */
export function normalizePid(pid) {
  if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0) {
    return pid;
  }
  if (typeof pid === 'string' && /^\d+$/.test(pid)) {
    const parsed = Number(pid);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function sanitizeLogValue(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  // Strip control characters and cap length so lock logs cannot leak secrets
  // or dump unbounded paths into CI logs.
  return value.replaceAll(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
}

/**
 * @param {LockRecovery} recovery
 * @param {(parts: unknown) => string} formatCommand
 */
export function formatRecoveryLogLine(recovery, formatCommand) {
  const owner = recovery.pid ? `pid ${recovery.pid}` : 'unknown pid';
  const ownerCwd = sanitizeLogValue(recovery.cwd) ?? 'unknown-cwd';
  const ownerCommand = recovery.command
    ? formatCommand(recovery.command)
    : 'unknown-command';
  const ageSec = Math.max(0, Math.round((recovery.ageMs ?? 0) / 1000));
  return `[typecheck-singleflight] removing stale typecheck lock held by ${owner} cwd=${ownerCwd} command=${ownerCommand} age=${ageSec}s reason=${recovery.reason}.`;
}
