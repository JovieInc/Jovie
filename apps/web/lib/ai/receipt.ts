/**
 * Per-call AI receipt: one structured log line per model call with token
 * counts and the prompt-cache hit ratio, keyed by the call's functionId.
 * Pure helpers only; `lib/ai/sdk.ts` emits the line for every call that goes
 * through the shared layer.
 */

export interface AiUsageLike {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly inputTokenDetails?: {
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
}

export interface AiReceipt {
  readonly kind: 'ai-receipt';
  readonly functionId: string;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  /** Provider that served the call; spend is split by it in the capacity registry. */
  readonly provider: 'gateway' | 'workers-ai';
  /** cacheRead / input; 0 when there was no input. */
  readonly cacheHitRatio: number;
}

export function buildAiReceipt(
  functionId: string | undefined,
  usage: AiUsageLike | undefined,
  provider: AiReceipt['provider'] = 'gateway'
): AiReceipt {
  const inputTokens = usage?.inputTokens ?? 0;
  const cacheReadTokens = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
  return {
    kind: 'ai-receipt',
    functionId: functionId ?? 'untagged',
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    provider,
    cacheHitRatio:
      inputTokens > 0 ? Number((cacheReadTokens / inputTokens).toFixed(3)) : 0,
  };
}

export function emitAiReceipt(receipt: AiReceipt): void {
  console.info(JSON.stringify(receipt));
}
