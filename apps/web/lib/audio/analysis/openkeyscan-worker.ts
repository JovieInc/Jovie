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
const DEFAULT_MAX_LINE_BYTES = 64 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;

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

function positiveInteger(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      `${label} must be a positive integer`
    );
  }
  return resolved;
}

function resolveLimits(input: OpenKeyScanWorkerLimits): ResolvedLimits {
  return {
    startupTimeoutMs: positiveInteger(
      input.startupTimeoutMs,
      DEFAULT_STARTUP_TIMEOUT_MS,
      'startup timeout'
    ),
    analysisTimeoutMs: positiveInteger(
      input.analysisTimeoutMs,
      DEFAULT_ANALYSIS_TIMEOUT_MS,
      'analysis timeout'
    ),
    shutdownGraceMs: positiveInteger(
      input.shutdownGraceMs,
      DEFAULT_SHUTDOWN_GRACE_MS,
      'shutdown grace'
    ),
    maxLineBytes: positiveInteger(
      input.maxLineBytes,
      DEFAULT_MAX_LINE_BYTES,
      'line limit'
    ),
    maxStderrBytes: positiveInteger(
      input.maxStderrBytes,
      DEFAULT_MAX_STDERR_BYTES,
      'stderr limit'
    ),
  };
}

function validateLaunch(launch: OpenKeyScanWorkerLaunch): void {
  if (!isAbsolute(launch.executable)) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      'analyzer executable must be absolute'
    );
  }
  if (launch.cwd !== undefined && !isAbsolute(launch.cwd)) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      'analyzer working directory must be absolute'
    );
  }
  if (
    launch.args.some(
      argument => argument.length === 0 || argument.includes('\0')
    )
  ) {
    throw new OpenKeyScanWorkerError(
      'invalid_configuration',
      'analyzer arguments must be nonempty and contain no null bytes'
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
      'analyzer environment is invalid'
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
  private ready = false;
  private closing = false;
  private closed = false;

  private constructor(launch: OpenKeyScanWorkerLaunch, limits: ResolvedLimits) {
    this.limits = limits;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.child = spawn(launch.executable, [...launch.args], {
      cwd: launch.cwd,
      env: { ...(launch.environment ?? {}), NODE_ENV: 'production' },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.handleStdout(String(chunk)));
    this.child.stderr.on('data', chunk => this.handleStderr(chunk as Buffer));
    this.child.once('error', () => {
      this.failWorker(
        new OpenKeyScanWorkerError(
          'worker_exited',
          'analyzer process could not start'
        )
      );
    });
    this.child.once('close', () => {
      this.closed = true;
      if (!this.closing) {
        this.failWorker(
          new OpenKeyScanWorkerError(
            'worker_exited',
            'analyzer process exited unexpectedly'
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
        'analyzer startup was cancelled'
      );
    }

    const worker = new OpenKeyScanWorker(launch, limits);
    const onAbort = () => {
      worker.failWorker(
        new OpenKeyScanWorkerError('aborted', 'analyzer startup was cancelled')
      );
      void worker.close();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    worker.startupTimeoutId = setTimeout(() => {
      worker.failWorker(
        new OpenKeyScanWorkerError(
          'startup_timeout',
          'analyzer did not become ready in time'
        )
      );
      void worker.close();
    }, limits.startupTimeoutMs);

    try {
      await worker.readyPromise;
      return worker;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
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
        'audio path must be absolute'
      );
    }
    if (!this.ready || this.closed || this.closing) {
      throw new OpenKeyScanWorkerError(
        'worker_exited',
        'analyzer worker is not available'
      );
    }
    if (this.pending) {
      throw new OpenKeyScanWorkerError(
        'invalid_configuration',
        'analyzer worker already has an active request'
      );
    }
    if (options.signal?.aborted) {
      throw new OpenKeyScanWorkerError(
        'aborted',
        'audio analysis was cancelled'
      );
    }

    const id = randomUUID();
    return new Promise<OpenKeyScanAnalysis>((resolve, reject) => {
      const onAbort = () => {
        this.rejectPending(
          new OpenKeyScanWorkerError('aborted', 'audio analysis was cancelled')
        );
        void this.close();
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      const timeoutId = setTimeout(() => {
        this.rejectPending(
          new OpenKeyScanWorkerError(
            'analysis_timeout',
            'audio analysis exceeded its time budget'
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

      this.child.stdin.write(
        `${JSON.stringify({ id, path: audioPath })}\n`,
        error => {
          if (!error) return;
          this.rejectPending(
            new OpenKeyScanWorkerError(
              'worker_exited',
              'analyzer request could not be written'
            )
          );
          void this.close();
        }
      );
    });
  }

  async close(): Promise<void> {
    if (this.closing || this.closed) return;
    this.closing = true;
    this.rejectPending(
      new OpenKeyScanWorkerError('aborted', 'analyzer worker was closed')
    );
    this.child.stdin.end();
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      this.closed = true;
      return;
    }

    this.child.kill('SIGTERM');
    await new Promise<void>(resolve => {
      const timeoutId = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          this.child.kill('SIGKILL');
        }
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
    if (Buffer.byteLength(this.stdoutBuffer) > this.limits.maxLineBytes) {
      this.protocolFailure('analyzer output exceeded the line limit');
      return;
    }

    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) this.handleLine(line);
      if (Buffer.byteLength(this.stdoutBuffer) > this.limits.maxLineBytes) {
        this.protocolFailure('analyzer output exceeded the line limit');
        return;
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }

  private handleStderr(chunk: Buffer): void {
    this.stderrBytes += chunk.byteLength;
    if (this.stderrBytes > this.limits.maxStderrBytes) {
      this.protocolFailure('analyzer diagnostic output exceeded its limit');
    }
  }

  private handleLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      this.protocolFailure('analyzer returned invalid JSON');
      return;
    }

    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'heartbeat' &&
      this.ready
    ) {
      return;
    }
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'ready'
    ) {
      if (this.ready || Object.keys(value).length !== 1) {
        this.protocolFailure('analyzer returned an invalid ready message');
        return;
      }
      this.ready = true;
      this.startupLatencyMs = Math.max(0, Date.now() - this.startedAt);
      this.resolveReady();
      return;
    }

    if (!this.ready || !this.pending) {
      this.protocolFailure('analyzer returned an unexpected message');
      return;
    }

    try {
      const message = parseOpenKeyScanProviderMessage(
        value,
        this.pending.audioPath
      );
      if (message.id !== this.pending.id) {
        this.protocolFailure('analyzer response id did not match the request');
        return;
      }
      if (message.status === 'success') {
        const pending = this.takePending();
        pending?.resolve({
          providerId: 'openkeyscan',
          key: message.key,
          providerClassId: message.classId,
          providerGeneration: message.generation,
          startupLatencyMs: this.startupLatencyMs,
          analysisLatencyMs: Math.max(
            0,
            Date.now() - (pending?.startedAt ?? 0)
          ),
        });
      } else {
        this.rejectPending(
          new OpenKeyScanWorkerError(
            'provider_error',
            'analyzer could not analyze the audio'
          )
        );
      }
    } catch (error) {
      this.protocolFailure(
        error instanceof OpenKeyScanProtocolError
          ? error.message
          : 'analyzer returned an invalid response'
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

  private protocolFailure(message: string): void {
    const error = new OpenKeyScanWorkerError('protocol_error', message);
    this.failWorker(error);
    void this.close();
  }

  private failWorker(error: OpenKeyScanWorkerError): void {
    if (!this.ready) this.rejectReady(error);
    this.rejectPending(error);
  }
}
