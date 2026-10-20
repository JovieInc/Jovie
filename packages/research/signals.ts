/**
 * Signal → decision-review bridge. The signal watcher (scripts/signals) stores
 * every AI-lab, platform and competitor changelog item and X bookmark as a
 * gbrain `type: signal` page with a Jev verdict. Items that say "adopt / buy /
 * borrow / clone" for internal ops are new tools, models or data: they become
 * `decision trigger`s, so the decisions they may invalidate get a linked
 * review instead of being silently overwritten or silently ignored.
 */
import { proposeReviews, type TriggerKind } from './decisions.ts';
import type { GbrainClient } from './gbrain.ts';
import type { ResearchState } from './state.ts';

export interface SignalPage {
  readonly slug: string;
  readonly title: string;
  readonly verdict?: string;
  readonly surface?: string;
  readonly score?: number;
  readonly category?: string;
  readonly url?: string;
  readonly updatedAt: string;
}

export const ACTIONABLE = new Set(['adopt', 'buy', 'borrow', 'clone']);
export const INTERNAL_SURFACES = new Set(['internal-ops', 'both']);

export function triggerKind(category: string | undefined): TriggerKind {
  if (category === 'ai-lab') return 'model';
  if (category === 'competitor') return 'data';
  return 'tool';
}

/** Which signals may change one of our decisions (pure; tested). */
export function actionable(signal: SignalPage, minScore = 0.6): boolean {
  return (
    ACTIONABLE.has(signal.verdict ?? '') &&
    INTERNAL_SURFACES.has(signal.surface ?? '') &&
    (signal.score ?? 0) >= minScore
  );
}

function frontmatterOf(page: Record<string, unknown>): Record<string, unknown> {
  return (page.frontmatter as Record<string, unknown> | undefined) ?? {};
}

export async function loadSignals(
  gbrain: GbrainClient,
  updatedAfter: string | undefined,
  limit = 40
): Promise<SignalPage[]> {
  const rows = await gbrain.call<
    { slug: string; title: string; updated_at: string }[]
  >('list_pages', {
    type: 'signal',
    sort: 'updated_asc',
    limit,
    ...(updatedAfter ? { updated_after: updatedAfter } : {}),
  });
  const list = Array.isArray(rows) ? rows : [];
  const out: SignalPage[] = new Array(list.length);
  // get_page is ~1-3s on the shared daemon; four at a time keeps a 40-page scan under a minute.
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      const row = list[i];
      const page = await gbrain
        .call<Record<string, unknown> | null>('get_page', { slug: row.slug })
        .catch(() => null);
      const fm = page ? frontmatterOf(page) : {};
      out[i] = {
        slug: row.slug,
        title: row.title,
        verdict: typeof fm.verdict === 'string' ? fm.verdict : undefined,
        surface: typeof fm.surface === 'string' ? fm.surface : undefined,
        score: typeof fm.score === 'number' ? fm.score : undefined,
        category: typeof fm.category === 'string' ? fm.category : undefined,
        url: typeof fm.url === 'string' ? fm.url : undefined,
        updatedAt: row.updated_at,
      };
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

export interface TriageResult {
  readonly scanned: number;
  readonly actionable: number;
  readonly reviews: {
    signal: string;
    decision: string;
    review: string | null;
  }[];
  readonly cursor: string | null;
}

/**
 * Scan signals newer than the stored cursor and propose decision reviews for
 * the actionable ones. Idempotent: the cursor and a per-signal marker keep a
 * signal from opening the same review twice.
 */
export async function triageSignals(
  deps: { gbrain: GbrainClient; state: ResearchState },
  opts: {
    dryRun?: boolean;
    minScore?: number;
    limit?: number;
    since?: string;
  } = {}
): Promise<TriageResult> {
  const cursor =
    opts.since ??
    ((await deps.state.getRaw('signal-cursor', Number.POSITIVE_INFINITY)) as
      | string
      | null) ??
    undefined;
  const signals = await loadSignals(deps.gbrain, cursor, opts.limit);
  const reviews: TriageResult['reviews'] = [];
  let count = 0;
  for (const signal of signals) {
    if (!actionable(signal, opts.minScore)) continue;
    count += 1;
    const seenKey = `signal-seen-${signal.slug.replace(/[^a-z0-9]+/gi, '-')}`;
    if (
      !opts.dryRun &&
      (await deps.state.getRaw(seenKey, Number.POSITIVE_INFINITY))
    )
      continue;
    const rows = await proposeReviews(deps.gbrain, {
      trigger: `${signal.title} (${signal.verdict} for ${signal.surface})`,
      kind: triggerKind(signal.category),
      topic: signal.title,
      evidence: [signal.slug, ...(signal.url ? [signal.url] : [])],
      dryRun: opts.dryRun,
    });
    for (const r of rows)
      reviews.push({
        signal: signal.slug,
        decision: r.decision,
        review: r.review,
      });
    if (!opts.dryRun) await deps.state.putRaw(seenKey, true);
  }
  const last = signals.at(-1)?.updatedAt ?? cursor ?? null;
  if (!opts.dryRun && last) await deps.state.putRaw('signal-cursor', last);
  return { scanned: signals.length, actionable: count, reviews, cursor: last };
}
