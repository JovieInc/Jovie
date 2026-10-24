import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * @typedef {Pick<import('node:child_process').ChildProcess, 'kill'> & Pick<import('node:events').EventEmitter, 'on'> & {
 *   stdin: import('node:stream').Writable,
 *   stdout: import('node:stream').Readable,
 *   stderr: import('node:stream').Readable
 * }} GuardChild
 * @typedef {{stdio: ['pipe', 'pipe', 'pipe'], shell: false}} GuardSpawnOptions
 * @typedef {(command: string, args: string[], options: GuardSpawnOptions) => GuardChild} GuardSpawn
 * @typedef {Error & {code: string, effect: 'unknown',
 *   observation?: {holds: {owner: string}[]}, reason?: string}} NativeBacklogGuardError
 */

const SCHEMA = 'jovie.backlog-writer-guard/v1';
const OBSERVATION_SCHEMA = 'jovie.backlog-admission-observation/v1';
const PREPARE_TIMEOUT_MS = 75_000;
const LOCK_TIMEOUT_MS = 20_000;
const CONTROL_TIMEOUT_MS = 25_000;
const MAX_FRAME_BYTES = 1024 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const BASE_KEYS = [
  'schema',
  'issue',
  'expectedVersion',
  'nonce',
  'authorizesTransition',
  'authorizesDispatch',
  'phase',
];
const record = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, required, optional = []) =>
  record(value) &&
  required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    key => required.includes(key) || optional.includes(key)
  );
const priorityIsValid = value =>
  Number.isInteger(value) && value >= 0 && value <= 4;

function unknown(code, frame) {
  /** @type {NativeBacklogGuardError} */
  const error = Object.assign(new Error(code), {
    code,
    effect: /** @type {const} */ ('unknown'),
  });
  if (frame?.observation) error.observation = frame.observation;
  if (frame?.reason) error.reason = frame.reason;
  return error;
}

function validObservation(value, issue, allowed) {
  return (
    keysAre(value, [
      'schema',
      'issue',
      'allowed',
      'authorizesTransition',
      'authorizesDispatch',
      'holds',
      'evidence',
    ]) &&
    value.schema === OBSERVATION_SCHEMA &&
    value.issue === issue &&
    value.allowed === allowed &&
    value.authorizesTransition === false &&
    value.authorizesDispatch === false &&
    record(value.evidence) &&
    Array.isArray(value.holds) &&
    (allowed ? value.holds.length === 0 : value.holds.length > 0) &&
    value.holds.every(
      hold =>
        keysAre(hold, ['code', 'owner', 'evidence', 'nextAction']) &&
        typeof hold.code === 'string' &&
        /^[a-z0-9-]{1,128}$/.test(hold.code) &&
        typeof hold.owner === 'string' &&
        hold.owner.length > 0 &&
        hold.owner.length <= 512 &&
        typeof hold.nextAction === 'string' &&
        hold.nextAction.length > 0 &&
        hold.nextAction.length <= 4096
    )
  );
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Private transport for the installed read guard. This module never writes
 * Linear, journals admission, reserves work or interprets provider drain.
 * Dependency injection is in-process only; no CLI, packet or path override.
 * @param {{identifier?: string, issueId?: string, expectedState?: string, expectedLinearUpdatedAt?: string | null}} delivery
 * @param {{spawnImpl?: GuardSpawn, now?: () => number}} [dependencies]
 */
export async function openNativeBacklogGuard(
  delivery,
  { spawnImpl = spawn, now = Date.now } = {}
) {
  const binding = {
    issue: delivery?.identifier,
    issueId: delivery?.issueId,
    version: delivery?.expectedLinearUpdatedAt,
  };
  if (
    delivery?.expectedState !== 'Backlog' ||
    !/^JOV-[1-9][0-9]{0,6}$/.test(binding.issue ?? '') ||
    !UUID.test(binding.issueId ?? '') ||
    typeof binding.version !== 'string' ||
    !VERSION.test(binding.version) ||
    !Number.isFinite(Date.parse(binding.version))
  )
    throw unknown('native-backlog-guard-binding-invalid');

  let child;
  try {
    child = spawnImpl(
      'python3',
      [
        join(
          homedir(),
          '.local/state/jovie-lanes/current/backlog_writer_guard.py'
        ),
        '--issue',
        binding.issue,
        '--expected-version',
        binding.version,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: false }
    );
  } catch {
    throw unknown('native-backlog-guard-spawn-failed');
  }
  const abort = new AbortController();
  let phase = 'starting',
    nonce,
    issueId,
    priority,
    observation,
    locked;
  let buffer = '',
    waiter,
    failed,
    closing = false,
    exited = false,
    leaseTimer;
  let resolveClosed;
  const childClosed = new Promise(resolve => {
    resolveClosed = resolve;
  });

  function fail(error) {
    if (failed) return failed;
    failed = error;
    clearTimeout(leaseTimer);
    abort.abort(error);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
      waiter = undefined;
    }
    return error;
  }

  function healthy() {
    if (failed) throw failed;
    if (closing) throw fail(unknown('native-backlog-guard-closed'));
    if (phase === 'locked' && now() >= Math.floor(locked.expiresAt * 1000))
      throw fail(unknown('native-backlog-guard-expired'));
  }

  function consume(frame) {
    if (
      !keysAre(frame, BASE_KEYS, [
        'issueId',
        'priority',
        'observation',
        'expiresAt',
        'lockIdentity',
        'result',
        'reason',
        'effect',
      ]) ||
      frame.schema !== SCHEMA ||
      frame.issue !== binding.issue ||
      frame.expectedVersion !== binding.version ||
      !/^[a-f0-9]{64}$/.test(frame.nonce ?? '') ||
      (nonce !== undefined && frame.nonce !== nonce) ||
      frame.authorizesTransition !== false ||
      frame.authorizesDispatch !== false
    )
      throw unknown('native-backlog-guard-protocol-invalid');
    if (frame.phase === 'held') {
      if (
        !keysAre(frame, BASE_KEYS, ['observation', 'reason', 'effect']) ||
        (frame.observation !== undefined &&
          !validObservation(frame.observation, binding.issue, false)) ||
        (frame.reason !== undefined &&
          (typeof frame.reason !== 'string' ||
            !/^[a-zA-Z0-9-]{1,128}$/.test(frame.reason))) ||
        (frame.effect !== undefined &&
          frame.effect !== 'unknown-if-parent-write-started') ||
        (!frame.observation && !frame.reason)
      )
        throw unknown('native-backlog-guard-protocol-invalid');
      throw unknown('native-backlog-guard-held', freeze(frame));
    }
    if (!waiter || frame.phase !== waiter.expected)
      throw unknown('native-backlog-guard-unexpected-frame');
    if (frame.phase === 'prepared' || frame.phase === 'locked') {
      const extras =
        frame.phase === 'locked' ? ['expiresAt', 'lockIdentity'] : [];
      if (
        !keysAre(frame, [
          ...BASE_KEYS,
          'issueId',
          'priority',
          'observation',
          ...extras,
        ]) ||
        frame.issueId !== binding.issueId ||
        !UUID.test(frame.issueId) ||
        !priorityIsValid(frame.priority) ||
        (issueId !== undefined &&
          (frame.issueId !== issueId || frame.priority !== priority)) ||
        !validObservation(frame.observation, binding.issue, true)
      )
        throw unknown('native-backlog-guard-protocol-invalid');
      if (frame.phase === 'locked') {
        const identity = frame.lockIdentity;
        // Python supplies fractional epoch seconds; Date.now truncates to ms.
        // Round toward the earlier deadline and stop one ms early so the
        // parent's abort signal cannot outlive the child's kernel lock window.
        const remaining = Math.floor(frame.expiresAt * 1000) - now();
        if (
          !Number.isFinite(frame.expiresAt) ||
          remaining <= 0 ||
          remaining > 25_000 ||
          !keysAre(identity, ['device', 'inode']) ||
          !Number.isSafeInteger(identity.device) ||
          identity.device < 0 ||
          !Number.isSafeInteger(identity.inode) ||
          identity.inode <= 0 ||
          (locked &&
            (frame.expiresAt !== locked.expiresAt ||
              identity.device !== locked.lockIdentity.device ||
              identity.inode !== locked.lockIdentity.inode)) ||
          (!locked && remaining < 20_000)
        )
          throw unknown('native-backlog-guard-lock-invalid');
        if (!locked) {
          locked = freeze(frame);
          leaseTimer = setTimeout(
            () => fail(unknown('native-backlog-guard-expired')),
            Math.max(0, remaining - 1)
          );
        }
      }
      nonce = frame.nonce;
      issueId = frame.issueId;
      priority = frame.priority;
      observation = freeze(frame.observation);
    } else if (frame.phase === 'released') {
      if (
        !keysAre(frame, [...BASE_KEYS, 'result']) ||
        frame.result !== waiter.result
      )
        throw unknown('native-backlog-guard-release-invalid');
      clearTimeout(leaseTimer);
    } else throw unknown('native-backlog-guard-unexpected-frame');
    phase = frame.phase;
    const pending = waiter;
    waiter = undefined;
    clearTimeout(pending.timer);
    pending.resolve(freeze(frame));
  }

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    if (closing || failed) return;
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES)
      return fail(unknown('native-backlog-guard-frame-too-large'));
    try {
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consume(JSON.parse(line));
      }
    } catch (error) {
      fail(
        error?.effect === 'unknown'
          ? error
          : unknown('native-backlog-guard-protocol-invalid')
      );
    }
  });
  child.stdout.on('end', () => {
    if (!closing && (buffer || phase !== 'released'))
      fail(unknown('native-backlog-guard-eof'));
  });
  child.stdout.on('error', () =>
    fail(unknown('native-backlog-guard-stream-error'))
  );
  child.stdin.on('error', () => {
    if (!closing) fail(unknown('native-backlog-guard-stream-error'));
  });
  // Drain diagnostics, but never expose private provider errors as protocol data.
  child.stderr.resume();
  child.on('error', () => fail(unknown('native-backlog-guard-child-error')));
  child.on('close', (code, signal) => {
    exited = true;
    resolveClosed({ code, signal });
    if (!closing && (phase !== 'released' || code !== 0))
      fail(unknown('native-backlog-guard-child-exit'));
  });

  function readFrame(expected, timeout, result) {
    healthy();
    if (waiter) throw fail(unknown('native-backlog-guard-concurrent-control'));
    return new Promise((resolve, reject) => {
      waiter = {
        expected,
        result,
        resolve,
        reject,
        timer: setTimeout(
          () => fail(unknown('native-backlog-guard-timeout')),
          timeout
        ),
      };
    });
  }

  function control(op, expected, timeout) {
    healthy();
    const response = readFrame(
      expected,
      Math.min(
        timeout,
        phase === 'locked'
          ? Math.floor(locked.expiresAt * 1000) - now()
          : timeout
      ),
      op
    );
    try {
      child.stdin.write(`${JSON.stringify({ nonce, op })}\n`);
    } catch {
      fail(unknown('native-backlog-guard-stream-error'));
    }
    return response;
  }

  async function close() {
    if (closing) return;
    closing = true;
    clearTimeout(leaseTimer);
    if (phase !== 'released') fail(unknown('native-backlog-guard-closed'));
    try {
      child.stdin.end();
    } catch {
      /* Own-child cleanup never proves release. */
    }
    if (!exited) {
      let timer;
      await Promise.race([
        childClosed,
        new Promise(resolve => {
          timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve(undefined);
          }, 1000);
        }),
      ]);
      clearTimeout(timer);
    }
  }

  const session = {
    get observation() {
      return observation;
    },
    get issueId() {
      return issueId;
    },
    get priority() {
      return priority;
    },
    get signal() {
      return abort.signal;
    },
    async lock() {
      healthy();
      if (phase !== 'prepared')
        throw fail(unknown('native-backlog-guard-phase-invalid'));
      const frame = await control('lock', 'locked', LOCK_TIMEOUT_MS);
      healthy();
      return frame;
    },
    async check() {
      healthy();
      if (phase !== 'locked')
        throw fail(unknown('native-backlog-guard-phase-invalid'));
      const frame = await control('check', 'locked', CONTROL_TIMEOUT_MS);
      healthy();
      return frame;
    },
    async finish(result = 'done') {
      healthy();
      if (phase !== 'locked' || !['done', 'abort'].includes(result))
        throw fail(unknown('native-backlog-guard-phase-invalid'));
      const frame = await control(result, 'released', CONTROL_TIMEOUT_MS);
      const exit = await Promise.race([
        childClosed,
        new Promise(resolve => {
          const timer = setTimeout(
            () => resolve(undefined),
            CONTROL_TIMEOUT_MS
          );
          childClosed.then(() => clearTimeout(timer));
        }),
      ]);
      healthy();
      if (!exit || exit.code !== 0)
        throw fail(unknown('native-backlog-guard-release-unverified'));
      return frame;
    },
    close,
  };
  try {
    await readFrame('prepared', PREPARE_TIMEOUT_MS);
    healthy();
    return session;
  } catch (error) {
    await close();
    throw error;
  }
}
