import 'server-only';
import { fetchSummerShadow } from '@/lib/ovie/summer-shadow-client';

/**
 * Production canary for the Summer fast chat path (P0 2026-10-25).
 *
 * Runs server-side with the founder principal and the production OIDC, so it
 * needs no human session and writes NOTHING to the founder's Summer history:
 * the fast chat endpoint is stateless (no conversation chain, no stored text).
 * It proves what Home depends on first: Summer is reachable, authenticated,
 * streams text and finishes. The durable Eve conversation chain is covered by
 * failed-turn error reporting (summer-stream), not by sending into it.
 */
export type SummerCanaryResult =
  | { readonly ok: true; readonly ttftMs: number; readonly totalMs: number }
  | { readonly ok: false; readonly code: string };

export async function runSummerCanary(input: {
  readonly principalHash: string;
  readonly now?: () => number;
  readonly fetchChat?: typeof fetchSummerShadow;
  readonly timeoutMs?: number;
}): Promise<SummerCanaryResult> {
  const now = input.now ?? Date.now;
  const fetchChat = input.fetchChat ?? fetchSummerShadow;
  const startedAt = now();
  try {
    const response = await fetchChat('/ovie/v1/summer-chat/stream', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Canary: reply with the single word pong.',
        mode: 'voice',
        history: [],
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
      headers: { 'x-jovie-summer-principal-hash': input.principalHash },
    });
    if (!response.ok || !response.body) {
      return { ok: false, code: `http_${response.status}` };
    }
    const text = await response.text();
    const firstDelta = text.indexOf('event: delta');
    if (text.includes('event: error'))
      return { ok: false, code: 'stream_error' };
    if (firstDelta < 0) return { ok: false, code: 'no_text' };
    if (!text.includes('event: done')) return { ok: false, code: 'no_done' };
    const finishedAt = now();
    return {
      ok: true,
      ttftMs: finishedAt - startedAt,
      totalMs: finishedAt - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof Error ? error.name || 'fetch_failed' : 'fetch_failed',
    };
  }
}
