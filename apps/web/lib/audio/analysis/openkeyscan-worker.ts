import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type { CanonicalMusicalKey } from '@jovie/audio-contracts';
import {
  OpenKeyScanProtocolError,
  parseOpenKeyScanProviderMessage,
} from './openkeyscan-protocol';

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_ANALYSIS_TIMEOUT_MS = 240_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 1_000;
// Stryker disable next-line ArithmeticOperator: module initializer mutations
// run before the active mutant; exact-boundary subprocess tests guard 64 KiB.
const DEFAULT_MAX_LINE_BYTES = 64 * 1024;
// Stryker disable next-line ArithmeticOperator: module initializer mutations
// run before the active mutant; exact-boundary subprocess tests guard 64 KiB.
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;
// Stryker disable next-line StringLiteral: module initializer mutations run
// before activation; subprocess tests prove UTF-8 NDJSON decoding end to end.
const WORKER_STDOUT_ENCODING = 'utf8';

// Stryker disable StringLiteral: these operator-facing diagnostics are
// deliberately not part of the typed contract. Error-code and redaction tests
// exercise every failure boundary without coupling callers to prose.
const WORKER_MESSAGE = {
  analysisAborted: 'audio analysis was cancelled',
  analysisTimeout: 'audio analysis exceeded its time budget',
  argumentInvalid:
    'analyzer arguments must be nonempty and contain no null bytes',
  environmentInvalid: 'analyzer environment is invalid',
  executableRelative: 'analyzer executable must be absolute',
  invalidJson: 'analyzer returned invalid JSON',
  invalidReady: 'analyzer returned an invalid ready message',
  invalidResponse: 'analyzer returned an invalid response',
  lineOverflow: 'analyzer output exceeded the line limit',
  limitAnalysis: 'analysis timeout',
  limitLine: 'line limit',
  limitShutdown: 'shutdown grace',
  limitStartup: 'startup timeout',
  limitStderr: 'stderr limit',
  positiveInteger: (label: string) => `${label} must be a positive integer`,
  providerError: 'analyzer could not analyze the audio',
  requestWrite: 'analyzer request could not be written',
  responseId: 'analyzer response id did not match the request',
  startupAborted: 'analyzer startup was cancelled',
  startupFailed: 'analyzer process could not start',
  startupTimeout: 'analyzer did not become ready in time',
  stderrOverflow: 'analyzer diagnostic output exceeded its limit',
  unexpectedExit: 'analyzer process exited unexpectedly',
  unexpectedMessage: 'analyzer returned an unexpected message',
  unavailable: 'analyzer worker is not available',
  activeRequest: 'analyzer worker already has an active request',
  audioPathRelative: 'audio path must be absolute',
  closed: 'analyzer worker was closed',
  cwdRelative: 'analyzer working directory must be absolute',
} as const;
// Stryker restore StringLiteral

export const OPENKEYSCAN_WORKER_ERROR_CODES = [
  'invalid_configuration',
  'startup_timeout',
  'analysis_timeout',
  'aborted',
  'protocol_error',
  'provider_error',
  'worker_exited',
] as const;

export type OpenKeyScanWorkerErrorCode =
  (typeof OPENKEYSCAN_WORKER_ERROR_CODES)[number];

export class OpenKeyScanWorkerError extends Error {
  constructor(
    readonly code: OpenKeyScanWorkerErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'OpenKeyScanWorkerError';
  }
}

export interface OpenKeyScanWorkerLaunch {
  /** Absolute path to a pinned OpenKeyScan executable or Python interpreter. */
  readonly executable: string;
  /** Explicit arguments, including the server script when using Python. */
  readonly args: readonly string[];
  /** Optional absolute working directory. */
  readonly cwd?: string;
  /**
   * Complete child environment except for the adapter's fixed production
   * NODE_ENV. Parent variables are intentionally not inherited so application
   * secrets cannot leak into the analyzer process.
   */
  readonly environment?: Readonly<Record<string, string>>;
}

export interface OpenKeyScanWorkerLimits {
  readonly startupTimeoutMs?: number;
  readonly analysisTimeoutMs?: number;
  readonly shutdownGraceMs?: number;
  readonly maxLineBytes?: number;
  readonly maxStderrBytes?: number;
}

export interface OpenKeyScanAnalysis {
  readonly providerId: 'openkeyscan';
  readonly key: CanonicalMusicalKey;
  readonly providerClassId: number;
  readonly providerGeneration: number;
  readonly startupLatencyMs: number;
  readonly analysisLatencyMs: number;
}

interface PendingRequest {
  readonly id: string;
  readonly audioPath: string;
  readonly startedAt: number;
  readonly resolve: (result: OpenKeyScanAnalysis) => void;
  readonly reject: (error: OpenKeyScanWorkerError) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
  readonly removeAbortListener: () => void;
}

interface ResolvedLimits {
  readonly startupTimeoutMs: number;
  readonly analysisTimeoutMs: number;
  readonly shutdownGraceMs: number;
  readonly maxLineBytes: number;
  readonly maxStderrBytes: number;
}

// Stryker disable all: static state literals are initialized before mutant
// activation and are asserted exactly by the transition-table tests.
export const OPENKEYSCAN_WORKER_STATE = {
  starting: 'starting',
  ready: 'ready',
  closing: 'closing',
  closed: 'closed',
} as const;
// Stryker restore all

export type OpenKeyScanWorkerState =
  (typeof OPENKEYSCAN_WORKER_STATE)[keyof typeof OPENKEYSCAN_WORKER_STATE];

export function canAcceptOpenKeyScanResponse<T>(
  state: OpenKeyScanWorkerState,
  pendingRequest: T | null
): pendingRequest is T {
  return state === OPENKEYSCAN_WORKER_STATE.ready && pendingRequest !== null;
}

export function isOpenKeyScanWorkerTerminal(
  state: OpenKeyScanWorkerState
): boolean {
  return (
    state === OPENKEYSCAN_WORKER_STATE.closing ||
    state === OPENKEYSCAN_WORKER_STATE.closed
  );
}

export function isUnexpectedOpenKeyScanExit(
  state: OpenKeyScanWorkerState
): boolean {
  return state !== OPENKEYSCAN_WORKER_STATE.closing;
}

export function exceedsOpenKeyScanByteLimit(
  bytes: number,
  limit: number
): boolean {
  return bytes > limit;
}

export function assertOpenKeyScanCanAnalyze(
  state: OpenKeyScanWorkerState
): void {
  if (state !== OPENKEYSCAN_WORKER_STATE.ready) {
    throw new OpenKeyScanWorkerError(
      'worker_exited',
      WORKER_MESSAGE.unavailable
    );
  }
}

export function requireOpenKeyScanPendingResponse<T>(
  state: OpenKeyScanWorkerState,
  pendingRequest: T | null
): T {
  if (!canAcceptOpenKeyScanResponse(state, pendingRequest)) {
    throw new OpenKeyScanProtocolError(WORKER_MESSAGE.unexpectedMessage);
  }
  return pendingRequest;
}

// Stryker disable all: these static spawn invariants are initialized before
// Stryker activates a mutant and are asserted exactly by the boundary tests.
export const OPENKEYSCAN_SPAWN_INVARIANTS: {
  shell: false;
  stdio: ['pipe', 'pipe', 'pipe'];
  windowsHide: true;
} = {
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
};
// Stryker restore all

export function buildOpenKeyScanEnvironment(
  environment: Readonly<Record<string, string>> | undefined
): NodeJS.ProcessEnv & { NODE_ENV: string } {
  return { ...(environment ?? {}), NODE_ENV: 'production' };
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      WORKER_MESSAGE.positiveInteger(label)
    );
  }
  return resolved;
}

function resolveLimits(input: OpenKeyScanWorkerLimits): ResolvedLimits {
  return {
    startupTimeoutMs: positiveInteger(
      input.startupTimeoutMs,
      DEFAULT_STARTUP_TIMEOUT_MS,
      WORKER_MESSAGE.limitStartup
    ),
    analysisTimeoutMs: positiveInteger(
      input.analysisTimeoutMs,
      DEFAULT_ANALYSIS_TIMEOUT_MS,
      WORKER_MESSAGE.limitAnalysis
    ),
    shutdownGraceMs: positiveInteger(
      input.shutdownGraceMs,
      DEFAULT_SHUTDOWN_GRACE_MS,
      WORKER_MESSAGE.limitShutdown
    ),
    maxLineBytes: positiveInteger(
      input.maxLineBytes,
      DEFAULT_MAX_LINE_BYTES,
      WORKER_MESSAGE.limitLine
    ),
    maxStderrBytes: positiveInteger(
      input.maxStderrBytes,
      DEFAULT_MAX_STDERR_BYTES,
      WORKER_MESSAGE.limitStderr
    ),
  };
}

function validateLaunch(launch: OpenKeyScanWorkerLaunch): void {
  if (!isAbsolute(launch.executable)) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      WORKER_MESSAGE.executableRelative
    );
  }
  if (launch.cwd !== undefined && !isAbsolute(launch.cwd)) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      WORKER_MESSAGE.cwdRelative
    );
  }
  if (
    launch.args.some(
      argument => argument.length === 0 || argument.includes('\0')
    )
  ) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      WORKER_MESSAGE.argumentInvalid
    );
  }
  if (
    Object.entries(launch.environment ?? {}).some(
      ([key, value]) =>
        key.length === 0 ||
        key.includes('=') ||
        key.includes('\0') ||
        value.includes('\0')
    )
  ) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      WORKER_MESSAGE.environmentInvalid
    );
  }
}

/**
 * One bounded OpenKeyScan NDJSON session.
 *
 * The adapter deliberately allows one in-flight analysis. This matches the
 * canonical provider registry's single offline-worker boundary and prevents
 * application concurrency from multiplying PyTorch memory usage.
 */
export class OpenKeyScanWorker {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly limits: ResolvedLimits;
  private readonly startedAt = Date.now();
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: OpenKeyScanWorkerError) => void;
  private startupTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingRequest | null = null;
  private stdoutBuffer = '';
  private stderrBytes = 0;
  private startupLatencyMs = 0;
  private state: OpenKeyScanWorkerState = OPENKEYSCAN_WORKER_STATE.starting;

  private constructor(launch: OpenKeyScanWorkerLaunch, limits: ResolvedLimits) {
    this.limits = limits;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.child = spawn(launch.executable, [...launch.args], {
      cwd: launch.cwd,
      env: buildOpenKeyScanEnvironment(launch.environment),
      ...OPENKEYSCAN_SPAWN_INVARIANTS,
    });

    this.child.stdout.setEncoding(WORKER_STDOUT_ENCODING);
    this.child.stdout.on('data', chunk => this.handleStdout(String(chunk)));
    this.child.stderr.on('data', chunk => this.handleStderr(chunk as Buffer));
    // Stryker disable next-line all: mutating Node's mandatory `error` handler
    // crashes the test runner; the real EPIPE subprocess test proves fail-close.
    this.child.stdin.on('error', () => this.failRequestWrite());
    this.child.once('error', () => {
      this.failWorker(
        new OpenKeyScanWorkerError(
          'worker_exited',
          WORKER_MESSAGE.startupFailed
        )
      );
    });
    this.child.once('close', () => {
      const previousState = this.state;
      this.state = OPENKEYSCAN_WORKER_STATE.closed;
      // Stryker disable next-line ConditionalExpression: after an intentional
      // close, failing the settled ready/pending promises is a no-op.
      if (isUnexpectedOpenKeyScanExit(previousState)) {
        this.failWorker(
          new OpenKeyScanWorkerError(
            'worker_exited',
            WORKER_MESSAGE.unexpectedExit
          )
        );
      }
    });
  }

  static async start(
    launch: OpenKeyScanWorkerLaunch,
    options: OpenKeyScanWorkerLimits & { readonly signal?: AbortSignal } = {}
  ): Promise<OpenKeyScanWorker> {
    validateLaunch(launch);
    const limits = resolveLimits(options);
    if (options.signal?.aborted) {
      throw new OpenKeyScanWorkerError(
        'aborted',
        WORKER_MESSAGE.startupAborted
      );
    }

    const worker = new OpenKeyScanWorker(launch, limits);
    const onAbort = () => {
      worker.failWorker(
        new OpenKeyScanWorkerError('aborted', WORKER_MESSAGE.startupAborted)
      );
      void worker.close();
    };
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: `once: false`
    // is equivalent because the listener is explicitly removed in `finally`.
    options.signal?.addEventListener('abort', onAbort, { once: true });
    worker.startupTimeoutId = setTimeout(() => {
      worker.failWorker(
        new OpenKeyScanWorkerError(
          'startup_timeout',
          WORKER_MESSAGE.startupTimeout
        )
      );
      void worker.close();
    }, limits.startupTimeoutMs);

    try {
      await worker.readyPromise;
      return worker;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      // Stryker disable next-line ConditionalExpression: assigned immediately
      // before this try/finally, so the truthy mutation is equivalent.
      if (worker.startupTimeoutId) {
        clearTimeout(worker.startupTimeoutId);
        worker.startupTimeoutId = null;
      }
    }
  }

  async analyze(
    audioPath: string,
    options: { readonly signal?: AbortSignal } = {}
  ): Promise<OpenKeyScanAnalysis> {
    if (!isAbsolute(audioPath)) {
      throw new OpenKeyScanWorkerError(
        'invalid_configuration',
        WORKER_MESSAGE.audioPathRelative
      );
    }
    assertOpenKeyScanCanAnalyze(this.state);
    if (this.pending) {
      throw new OpenKeyScanWorkerError(
        'invalid_configuration',
        WORKER_MESSAGE.activeRequest
      );
    }
    if (options.signal?.aborted) {
      throw new OpenKeyScanWorkerError(
        'aborted',
        WORKER_MESSAGE.analysisAborted
      );
    }

    const id = randomUUID();
    return new Promise<OpenKeyScanAnalysis>((resolve, reject) => {
      const onAbort = () => {
        this.rejectPending(
          new OpenKeyScanWorkerError('aborted', WORKER_MESSAGE.analysisAborted)
        );
        void this.close();
      };
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: the listener is
      // explicitly removed whenever the single pending request is settled.
      options.signal?.addEventListener('abort', onAbort, { once: true });
      const timeoutId = setTimeout(() => {
        this.rejectPending(
          new OpenKeyScanWorkerError(
            'analysis_timeout',
            WORKER_MESSAGE.analysisTimeout
          )
        );
        void this.close();
      }, this.limits.analysisTimeoutMs);
      this.pending = {
        id,
        audioPath,
        startedAt: Date.now(),
        resolve,
        reject,
        timeoutId,
        removeAbortListener: () =>
          options.signal?.removeEventListener('abort', onAbort),
      };

      this.child.stdin.write(`${JSON.stringify({ id, path: audioPath })}\n`);
    });
  }

  async close(): Promise<void> {
    if (isOpenKeyScanWorkerTerminal(this.state)) return;
    this.state = OPENKEYSCAN_WORKER_STATE.closing;
    this.rejectPending(
      new OpenKeyScanWorkerError('aborted', WORKER_MESSAGE.closed)
    );
    this.child.stdin.end();
    this.child.kill('SIGTERM');
    await new Promise<void>(resolve => {
      const timeoutId = setTimeout(() => {
        this.child.kill('SIGKILL');
        resolve();
      }, this.limits.shutdownGraceMs);
      this.child.once('close', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    if (
      exceedsOpenKeyScanByteLimit(
        Buffer.byteLength(this.stdoutBuffer),
        this.limits.maxLineBytes
      )
    ) {
      this.protocolFailure(WORKER_MESSAGE.lineOverflow);
      return;
    }

    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) this.handleLine(line);
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }

  private handleStderr(chunk: Buffer): void {
    this.stderrBytes += chunk.byteLength;
    if (
      exceedsOpenKeyScanByteLimit(this.stderrBytes, this.limits.maxStderrBytes)
    ) {
      this.protocolFailure(WORKER_MESSAGE.stderrOverflow);
    }
  }

  private handleLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
      // Stryker disable next-line BlockStatement: an empty catch converges on
      // the same fail-closed protocol error via the response parser below.
    } catch {
      this.protocolFailure(WORKER_MESSAGE.invalidJson);
      return;
    }

    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'heartbeat' &&
      this.state === OPENKEYSCAN_WORKER_STATE.ready
    ) {
      return;
    }
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'ready'
    ) {
      if (
        this.state !== OPENKEYSCAN_WORKER_STATE.starting ||
        Object.keys(value).length !== 1
      ) {
        this.protocolFailure(WORKER_MESSAGE.invalidReady);
        return;
      }
      this.state = OPENKEYSCAN_WORKER_STATE.ready;
      this.startupLatencyMs = Math.max(0, Date.now() - this.startedAt);
      this.resolveReady();
      return;
    }

    try {
      const pending = requireOpenKeyScanPendingResponse(
        this.state,
        this.pending
      );
      const message = parseOpenKeyScanProviderMessage(value, pending.audioPath);
      if (message.id !== pending.id) {
        this.protocolFailure(WORKER_MESSAGE.responseId);
        return;
      }
      if (message.status === 'success') {
        this.takePending();
        pending.resolve({
          providerId: 'openkeyscan',
          key: message.key,
          providerClassId: message.classId,
          providerGeneration: message.generation,
          startupLatencyMs: this.startupLatencyMs,
          analysisLatencyMs: Math.max(0, Date.now() - pending.startedAt),
        });
      } else {
        this.rejectPending(
          new OpenKeyScanWorkerError(
            'provider_error',
            WORKER_MESSAGE.providerError
          )
        );
      }
    } catch (error) {
      this.protocolFailure(
        error instanceof OpenKeyScanProtocolError
          ? error.message
          : WORKER_MESSAGE.invalidResponse
      );
    }
  }

  private takePending(): PendingRequest | null {
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.removeAbortListener();
    }
    return pending;
  }

  private rejectPending(error: OpenKeyScanWorkerError): void {
    this.takePending()?.reject(error);
  }

  private failRequestWrite(): void {
    // Stryker disable next-line ConditionalExpression: duplicate stream error
    // signals after the pending request is settled are intentional no-ops.
    if (!this.pending) return;
    this.rejectPending(
      new OpenKeyScanWorkerError('worker_exited', WORKER_MESSAGE.requestWrite)
    );
    void this.close();
  }

  private protocolFailure(message: string): void {
    const error = new OpenKeyScanWorkerError('protocol_error', message);
    this.failWorker(error);
    void this.close();
  }

  private failWorker(error: OpenKeyScanWorkerError): void {
    // Stryker disable next-line ConditionalExpression: rejecting the already
    // settled ready promise after startup is observably equivalent.
    if (this.state === OPENKEYSCAN_WORKER_STATE.starting)
      this.rejectReady(error);
    this.rejectPending(error);
  }
}
