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
    invoke: (model: FailoverCapableModel) => PromiseLike<RESULT>
  ): Promise<RESULT> {
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
      return invoke(fallbackModel);
    }
    try {
      const result = await invoke(primary.model);
      if (input.served) input.served.provider = primary.name;
      return result;
    } catch (error) {
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
      const result = await invoke(fallbackModel);
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
      value: (options: never) => run(model => model.doStream(options)),
    },
  });
  return wrapped;
}
