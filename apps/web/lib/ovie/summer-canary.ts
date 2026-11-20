import 'server-only';
import { parseSseFrames } from '@/lib/ovie/summer-fast-speaker';
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
/** Targets Tim set for interactive chat: first token p50 under 1.5 s, p95 under 3 s. */
export const SUMMER_TTFT_TARGET_MS = { p50: 1500, p95: 3000 } as const;

/** Server-side hop trace Summer reports on `done` (summer-config traceTiming). */
export type SummerServerTiming = {
  readonly authMs: number | null;
  readonly queueMs: number | null;
  readonly setupMs: number | null;
  readonly modelMs: number | null;
  readonly uptimeS: number | null;
};

export type SummerCanaryResult =
  | {
      readonly ok: true;
      /** Request start to the first streamed text (what Tim feels). */
      readonly ttftMs: number;
      /** Request start to response headers: identity, OIDC, network, cold start, Summer auth. */
      readonly headersMs: number;
      readonly totalMs: number;
      readonly model: string | null;
      readonly server: SummerServerTiming | null;
      /** Summer's full hop trace as sent (provider guard, ledger admission, reasoning start...). */
      readonly trace: Record<string, unknown> | null;
      readonly withinTarget: { readonly p50: boolean };
    }
  | { readonly ok: false; readonly code: string };

type Frame = { event: string; data: Record<string, unknown> };

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
    const headersAt = now();
    if (!response.ok || !response.body) {
      void response.body?.cancel().catch(() => undefined);
      return { ok: false, code: `http_${response.status}` };
    }
    let firstDeltaAt: number | null = null;
    let done: Frame | null = null;
    let finishedAt: number | null = null;
    let model: string | null = null;
    for await (const frame of parseSseFrames(response.body)) {
      if (frame.event === 'error') return { ok: false, code: 'stream_error' };
      if (frame.event === 'meta' && typeof frame.data.model === 'string')
        model = frame.data.model;
      if (
        frame.event === 'delta' &&
        typeof frame.data.text === 'string' &&
        frame.data.text.length > 0 &&
        firstDeltaAt === null
      )
        firstDeltaAt = now();
      if (frame.event === 'done') {
        done = frame;
        finishedAt = now();
        break;
      }
    }
    if (firstDeltaAt === null) return { ok: false, code: 'no_text' };
    if (!done || finishedAt === null) return { ok: false, code: 'no_done' };
    const timing = done.data.timing as Partial<SummerServerTiming> | undefined;
    const num = (value: unknown) => (typeof value === 'number' ? value : null);
    const ttftMs = firstDeltaAt - startedAt;
    return {
      ok: true,
      ttftMs,
      headersMs: headersAt - startedAt,
      totalMs: finishedAt - startedAt,
      model,
      trace:
        timing && typeof timing === 'object'
          ? (timing as Record<string, unknown>)
          : null,
      server: timing
        ? {
            authMs: num(timing.authMs),
            queueMs: num(timing.queueMs),
            setupMs: num(timing.setupMs),
            modelMs: num(timing.modelMs),
            uptimeS: num(timing.uptimeS),
          }
        : null,
      withinTarget: { p50: ttftMs <= SUMMER_TTFT_TARGET_MS.p50 },
    };
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof Error || error instanceof DOMException
          ? error.name || 'fetch_failed'
          : 'fetch_failed',
    };
  }
}

export type SummerTtftSummary = {
  readonly route: string;
  readonly sample: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly withinTarget: boolean | null;
};

/**
 * Published first-token percentiles from Summer's per-turn receipts (server
 * side, from chat start to first text; excludes cold start and auth, which the
 * canary's own ttftMs/headersMs include). Targets: p50 < 1.5 s, p95 < 3 s.
 */
export async function readSummerTtftSummary(
  fetchChat: typeof fetchSummerShadow,
  principalHash: string
): Promise<SummerTtftSummary[] | null> {
  try {
    const response = await fetchChat('/ovie/v1/summer-chat/metrics', {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: { 'x-jovie-summer-principal-hash': principalHash },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      routes?: Record<
        string,
        { ok?: number; ttftMs?: { p50?: number | null; p95?: number | null } }
      >;
    };
    return Object.entries(body.routes ?? {}).map(([route, stats]) => {
      const p50 = stats.ttftMs?.p50 ?? null;
      const p95 = stats.ttftMs?.p95 ?? null;
      return {
        route,
        sample: stats.ok ?? 0,
        p50,
        p95,
        withinTarget:
          p50 === null || p95 === null
            ? null
            : p50 <= SUMMER_TTFT_TARGET_MS.p50 &&
              p95 <= SUMMER_TTFT_TARGET_MS.p95,
      };
    });
  } catch {
    return null;
  }
}
