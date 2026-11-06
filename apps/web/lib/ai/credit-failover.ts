/**
 * Two-provider model failover so one provider's credits running out can never
 * take Jovie down (Vercel AI Gateway <-> Cloudflare Workers AI).
 *
 * The wrapped model keeps every property of the primary (spec version, id,
 * supported URLs) and only overrides `doGenerate` / `doStream`: when the
 * primary rejects with a failover-worthy error before producing output, the
 * same call is replayed once on the secondary. A credit/quota error also opens
 * a short per-provider breaker so the next calls skip the dead provider
 * instead of paying a failed round trip each time.
 */
import {
  isGatewayBudgetExceededError,
  isGatewayInsufficientFundsError,
} from '@/lib/ai/gateway-errors';
import { isStreamStallError } from '@/lib/ai/stream-stall-guard';

export type AiProviderName = 'gateway' | 'workers-ai';

interface FailoverCapableModel {
  doGenerate: (options: never) => PromiseLike<unknown>;
  doStream: (options: never) => PromiseLike<unknown>;
}

const CREDIT_MESSAGE =
  /insufficient[_ ](?:funds|credits?|balance)|out of credits|credits? (?:exhausted|exceeded|depleted)|payment required|quota (?:exceeded|exhausted)|exceeded (?:your |the )?(?:quota|spend limit|credit)|daily free allocation|neurons|billing|spend limit|positive credit balance|budget exceeded/iu;

function* walkErrors(error: unknown): Generator<Record<string, unknown>> {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (candidate == null || seen.has(candidate)) continue;
    seen.add(candidate);
    if (typeof candidate === 'string') {
      yield { message: candidate };
      const text = candidate.trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          pending.push(JSON.parse(text));
        } catch {
          // Plain text bodies are still matched on the message above.
        }
      }
      continue;
    }
    if (typeof candidate !== 'object') continue;
    const record = candidate as Record<string, unknown>;
    yield record;
    for (const key of [
      'cause',
      'lastError',
      'errors',
      'error',
      'data',
      'responseBody',
      'body',
    ]) {
      const next = record[key];
      if (Array.isArray(next)) pending.push(...next);
      else pending.push(next);
    }
  }
}

/**
 * True for "this provider has no money / quota left": Gateway insufficient
 * funds and key budgets, an HTTP 402 from any provider, and Cloudflare's
 * out-of-allocation / out-of-credit messages.
 */
export function isProviderCreditError(error: unknown): boolean {
  if (
    isGatewayInsufficientFundsError(error) ||
    isGatewayBudgetExceededError(error)
  ) {
    return true;
  }
  for (const record of walkErrors(error)) {
    if (record.statusCode === 402 || record.status === 402) return true;
    const message = record.message;
    if (typeof message === 'string' && CREDIT_MESSAGE.test(message)) {
      return true;
    }
  }
  return false;
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/** Per-process breaker: a provider that just reported no credit is skipped for a while. */
const BREAKER_MS = 60_000;
const creditBreaker = new Map<AiProviderName, number>();

export function creditBreakerOpen(
  provider: AiProviderName,
  now: number = Date.now()
): boolean {
  const until = creditBreaker.get(provider);
  if (until === undefined) return false;
  if (until <= now) {
    creditBreaker.delete(provider);
    return false;
  }
  return true;
}

export function resetCreditBreakers(): void {
  creditBreaker.clear();
}

export interface AiFailoverEvent {
  readonly kind: 'ai-failover';
  readonly label: string;
  readonly from: AiProviderName;
  readonly to: AiProviderName;
  readonly reason: 'credit' | 'error' | 'breaker';
}

export interface CreditFailoverInput<MODEL extends FailoverCapableModel> {
  /** Call-site label (telemetry functionId or `gateway`) for the failover log line. */
  readonly label: string;
  readonly primary: { readonly name: AiProviderName; readonly model: MODEL };
  /** Typed loosely: the two providers can resolve different `@ai-sdk/provider` patch versions. */
  readonly secondary: {
    readonly name: AiProviderName;
    readonly model: FailoverCapableModel | undefined;
  };
  /** Which errors on the primary are worth one replay on the secondary. */
  readonly shouldFailover?: (error: unknown) => boolean;
  /** Written with the provider that ended up serving the call. */
  readonly served?: { provider?: AiProviderName };
  readonly onFailover?: (event: AiFailoverEvent) => void;
  readonly now?: () => number;
}

function logFailover(event: AiFailoverEvent): void {
  console.warn(JSON.stringify(event));
}

interface StreamPart {
  readonly type?: string;
  readonly error?: unknown;
}

interface StreamResult {
  readonly stream: ReadableStream<StreamPart>;
}

const STREAM_METADATA_PARTS = new Set(['stream-start', 'response-metadata']);
// Bound lookahead memory even when a provider floods metadata without content.
const MAX_LEADING_STREAM_METADATA_PARTS = 16;

function hasStream(result: unknown): result is StreamResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as StreamResult).stream?.getReader === 'function'
  );
}

/** Keep pre-output errors inside the existing one-replay boundary. */
async function prepareStreamResult(
  result: unknown,
  shouldFailover: (error: unknown) => boolean,
  signal?: AbortSignal
): Promise<unknown> {
  if (!hasStream(result)) return result;
  const reader = result.stream.getReader();
  const buffered: StreamPart[] = [];
  let cancellation: Promise<void> | undefined;
  const cancel = (reason: unknown) => (cancellation ??= reader.cancel(reason));
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = signal
    ? new Promise<never>((_resolve, reject) => {
        rejectAbort = reject;
      })
    : undefined;
  void aborted?.catch(() => undefined);
  const onAbort = () => {
    rejectAbort?.(signal?.reason);
    void cancel(signal?.reason).catch(() => undefined);
  };
  const dispose = () => signal?.removeEventListener('abort', onAbort);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const read = async () => {
    signal?.throwIfAborted();
    const next = await (aborted
      ? Promise.race([reader.read(), aborted])
      : reader.read());
    signal?.throwIfAborted();
    return next;
  };
  let ended = false;
  let terminalFailure: { error: unknown } | undefined;
  try {
    for (;;) {
      const next = await read();
      if (next.done) {
        ended = true;
        break;
      }
      if (next.value.type === 'error' && shouldFailover(next.value.error)) {
        throw next.value.error;
      }
      const metadata = STREAM_METADATA_PARTS.has(next.value.type ?? '');
      if (metadata && buffered.length >= MAX_LEADING_STREAM_METADATA_PARTS) {
        throw new Error('Model stream exceeded its pre-output metadata limit');
      }
      buffered.push(next.value);
      // Text, reasoning and tool parts commit this provider. Never replay them.
      if (!metadata) break;
    }
  } catch (error) {
    dispose();
    void cancel(error).catch(() => undefined);
    if (signal?.aborted || shouldFailover(error)) throw error;
    // A terminal provider failure must keep the SDK's original stream channel.
    terminalFailure = { error };
  }

  let index = 0;
  return {
    ...result,
    stream: new ReadableStream<StreamPart>(
      {
        async pull(controller) {
          try {
            signal?.throwIfAborted();
            if (index < buffered.length) {
              controller.enqueue(buffered[index++]);
              return;
            }
            if (terminalFailure) throw terminalFailure.error;
            const next = ended ? { done: true as const } : await read();
            if (next.done) {
              dispose();
              controller.close();
            } else {
              controller.enqueue(next.value);
            }
          } catch (error) {
            dispose();
            void cancel(error).catch(() => undefined);
            controller.error(error);
          }
        },
        cancel(reason) {
          dispose();
          return cancel(reason);
        },
      },
      { highWaterMark: 0 }
    ),
  };
}

export function createCreditFailoverModel<MODEL extends FailoverCapableModel>(
  input: CreditFailoverInput<MODEL>
): MODEL {
  const { primary, secondary } = input;
  const now = input.now ?? Date.now;
  const shouldFailover =
    input.shouldFailover ??
    ((error: unknown) =>
      (isProviderCreditError(error) || isStreamStallError(error)) &&
      !isAbortError(error));
  const emit = input.onFailover ?? logFailover;

  async function run<RESULT>(
    invoke: (
      model: FailoverCapableModel,
      replayable: boolean
    ) => PromiseLike<RESULT>,
    signal?: AbortSignal
  ): Promise<RESULT> {
    signal?.throwIfAborted();
    const fallbackModel = secondary.model;
    if (fallbackModel && creditBreakerOpen(primary.name, now())) {
      emit({
        kind: 'ai-failover',
        label: input.label,
        from: primary.name,
        to: secondary.name,
        reason: 'breaker',
      });
      if (input.served) input.served.provider = secondary.name;
      return invoke(fallbackModel, false);
    }
    try {
      const result = await invoke(primary.model, Boolean(fallbackModel));
      if (input.served) input.served.provider = primary.name;
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      if (!fallbackModel || !shouldFailover(error)) throw error;
      const credit = isProviderCreditError(error);
      if (credit) creditBreaker.set(primary.name, now() + BREAKER_MS);
      emit({
        kind: 'ai-failover',
        label: input.label,
        from: primary.name,
        to: secondary.name,
        reason: credit ? 'credit' : 'error',
      });
      const result = await invoke(fallbackModel, false);
      if (input.served) input.served.provider = secondary.name;
      return result;
    }
  }

  const wrapped = Object.create(primary.model) as MODEL;
  Object.defineProperties(wrapped, {
    doGenerate: {
      value: (options: never) => run(model => model.doGenerate(options)),
    },
    doStream: {
      value: (options: never) => {
        const signal = (options as { abortSignal?: AbortSignal }).abortSignal;
        return run(async (model, replayable) => {
          const result = await model.doStream(options);
          // The secondary is already terminal: preserve its SDK error channel.
          return replayable
            ? prepareStreamResult(result, shouldFailover, signal)
            : result;
        }, signal);
      },
    },
  });
  return wrapped;
}
