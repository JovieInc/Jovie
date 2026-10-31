/**
 * Bounded first-chunk and idle timeouts for provider streams.
 *
 * A provider that accepts the request and then neither streams nor errors
 * (golden-path walk 2026-10-31: `zai/glm-5.3-flash` turn stuck in
 * `chat_turns.status='streaming'`, typing dots forever) leaves every layer
 * above waiting: failover only fires on a thrown error, `streamText.onError`
 * never runs, and the turn is never finalized. This wrapper turns "no
 * progress" into a thrown `StreamStallError` so failover and the terminal
 * turn status can act on it (security.md: server-side external calls must be
 * bounded).
 *
 * - First chunk: no content part within `firstChunkMs` of the call starting
 *   (`doStream` itself included). Nothing was emitted yet, so the caller can
 *   replay the call on the other provider.
 * - Idle: no further part within `idleMs` once content started. The stream
 *   errors; a started reply cannot be replayed.
 */

/** Chat replies took 9-19s end to end; 15s with no first part is a stall. */
export const STREAM_FIRST_CHUNK_TIMEOUT_MS = 15_000;
/** Longest silent gap tolerated inside a started stream. */
export const STREAM_IDLE_TIMEOUT_MS = 25_000;

export const STREAM_STALLED_ERROR_CODE = 'CHAT_STREAM_STALLED';

export type StreamStallPhase = 'first-chunk' | 'idle';

export class StreamStallError extends Error {
  readonly code = STREAM_STALLED_ERROR_CODE;
  readonly phase: StreamStallPhase;
  readonly timeoutMs: number;

  constructor(phase: StreamStallPhase, timeoutMs: number) {
    super(
      phase === 'first-chunk'
        ? `Model stream produced no output within ${timeoutMs}ms`
        : `Model stream went silent for ${timeoutMs}ms`
    );
    this.name = 'StreamStallError';
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

export function isStreamStallError(error: unknown): error is StreamStallError {
  return (
    error instanceof StreamStallError ||
    (error instanceof Error && error.name === 'StreamStallError')
  );
}

export interface StreamStallGuardOptions {
  readonly firstChunkMs?: number;
  readonly idleMs?: number;
}

interface StreamingModel {
  doStream: (options: never) => PromiseLike<unknown>;
}

interface StreamCallOptions {
  abortSignal?: AbortSignal;
}

interface StreamCallResult {
  stream: ReadableStream<{ type?: string }>;
}

/** Parts that arrive before the provider produced anything. */
const METADATA_PARTS = new Set(['stream-start', 'response-metadata']);

async function guardedDoStream(
  model: StreamingModel,
  options: StreamCallOptions,
  config: Required<StreamStallGuardOptions>
): Promise<StreamCallResult> {
  const controller = new AbortController();
  const signal = options.abortSignal
    ? AbortSignal.any([options.abortSignal, controller.signal])
    : controller.signal;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stalled: StreamStallError | undefined;
  let rejectStall: (error: StreamStallError) => void = () => undefined;
  const stallPromise = new Promise<never>((_, reject) => {
    rejectStall = reject;
  });
  // Consumed through the races below; never an unhandled rejection.
  stallPromise.catch(() => undefined);

  const arm = (phase: StreamStallPhase, ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = new StreamStallError(phase, ms);
      controller.abort(stalled);
      rejectStall(stalled);
    }, ms);
  };

  arm('first-chunk', config.firstChunkMs);
  let result: StreamCallResult;
  try {
    result = (await Promise.race([
      model.doStream({ ...options, abortSignal: signal } as never),
      stallPromise,
    ])) as StreamCallResult;
  } catch (error) {
    clearTimeout(timer);
    throw stalled ?? error;
  }

  const reader = result.stream.getReader();
  const guarded = new ReadableStream<{ type?: string }>({
    async pull(downstream) {
      try {
        const next = await Promise.race([reader.read(), stallPromise]);
        if (next.done) {
          clearTimeout(timer);
          downstream.close();
          return;
        }
        if (!METADATA_PARTS.has(next.value?.type ?? '')) {
          arm('idle', config.idleMs);
        }
        downstream.enqueue(next.value);
      } catch (error) {
        clearTimeout(timer);
        reader.cancel(error).catch(() => undefined);
        downstream.error(stalled ?? error);
      }
    },
    cancel(reason) {
      clearTimeout(timer);
      return reader.cancel(reason);
    },
  });
  return { ...result, stream: guarded };
}

/**
 * Returns `model` with `doStream` bounded. Every other property stays that of
 * the wrapped model (same approach as the credit-failover wrapper).
 */
export function withStreamStallGuard<MODEL extends StreamingModel>(
  model: MODEL,
  options: StreamStallGuardOptions = {}
): MODEL {
  const config = {
    firstChunkMs: options.firstChunkMs ?? STREAM_FIRST_CHUNK_TIMEOUT_MS,
    idleMs: options.idleMs ?? STREAM_IDLE_TIMEOUT_MS,
  };
  // Not a streaming model object (e.g. a bare model id string): nothing to bound.
  if (
    typeof model !== 'object' ||
    model === null ||
    typeof model.doStream !== 'function'
  ) {
    return model;
  }
  const wrapped = Object.create(model) as MODEL;
  // Configurable + writable: the AI SDK may wrap a v3 model in a Proxy, which
  // rejects a non-configurable own property that it does not return as-is.
  Object.defineProperty(wrapped, 'doStream', {
    configurable: true,
    writable: true,
    enumerable: true,
    value: (callOptions: StreamCallOptions) =>
      guardedDoStream(model, callOptions, config),
  });
  return wrapped;
}
