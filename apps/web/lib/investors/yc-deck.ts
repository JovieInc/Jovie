import type { FundraisingRegistry } from '@/lib/investors/fundraising-registry';
import type { InvestorMetricsSnapshot } from '@/lib/investors/sourced-metrics';

export const YC_DECK_SECTION_IDS = [
  'problem',
  'solution',
  'traction',
  'market',
  'business-model',
  'team',
  'ask',
] as const;

export type YcDeckSectionId = (typeof YC_DECK_SECTION_IDS)[number];

export interface YcDeckSection {
  readonly id: YcDeckSectionId;
  readonly dominantSentence: string;
  readonly support: readonly string[];
}

function slideCopy(
  registry: FundraisingRegistry,
  id: string
): { dominantSentence: string; support: readonly string[] } | null {
  const slide = registry.coreSlides.find(candidate => candidate.id === id);
  if (!slide) return null;
  return {
    dominantSentence: slide.dominantSentence,
    support: slide.support,
  };
}

function riskAnswer(registry: FundraisingRegistry, id: string): string | null {
  const risk = registry.risks.find(candidate => candidate.id === id);
  return risk?.answer ?? null;
}

function tractionSection(
  registry: FundraisingRegistry,
  metrics: InvestorMetricsSnapshot
): YcDeckSection {
  if (metrics.stats.length === 0 || metrics.asOf === null) {
    return {
      id: 'traction',
      dominantSentence:
        riskAnswer(registry, 'traction') ??
        'No sourced company metric is available for this deck.',
      support: [],
    };
  }

  return {
    id: 'traction',
    dominantSentence: `Sourced company metrics as of ${metrics.asOf}.`,
    support: metrics.stats.map(
      stat =>
        `${stat.label}: ${stat.value} ${stat.unit} (${stat.sourceKind}, ${stat.sourceLabel}, observed ${stat.observedAt}).`
    ),
  };
}

/**
 * YC section order from the canonical registry plus sourced metrics.
 * Traction contains only stats the metrics snapshot already accepted.
 */
export function buildInvestorYcDeck(
  registry: FundraisingRegistry,
  metrics: InvestorMetricsSnapshot
): readonly YcDeckSection[] {
  const problem = slideCopy(registry, 'problem');
  const wedge = slideCopy(registry, 'wedge');
  const product = slideCopy(registry, 'product');
  const founder = slideCopy(registry, 'founder');
  const round = slideCopy(registry, 'round');
  const market = riskAnswer(registry, 'market');
  const businessModel = riskAnswer(registry, 'business-model');

  const sections: Array<YcDeckSection | null> = [
    problem ? { id: 'problem', ...problem } : null,
    wedge
      ? {
          id: 'solution',
          dominantSentence: wedge.dominantSentence,
          support: product
            ? [...wedge.support, product.dominantSentence]
            : wedge.support,
        }
      : null,
    tractionSection(registry, metrics),
    market ? { id: 'market', dominantSentence: market, support: [] } : null,
    businessModel
      ? {
          id: 'business-model',
          dominantSentence: businessModel,
          support: [],
        }
      : null,
    founder ? { id: 'team', ...founder } : null,
    round ? { id: 'ask', ...round } : null,
  ];

  return sections.filter(
    (section): section is YcDeckSection => section !== null
  );
}

// ---------------------------------------------------------------------------
// Ledger-backed deck (2026-11-01). The same generator, fed by the private
// fundraising claims ledger instead of the static registry: a story spec names
// the slides and cites ledger ids, and every claim-like number on a slide must
// be covered by a value of a claim or metric that slide cites. Pure: callers
// load the private YAML; nothing private is committed to this repo.
// ---------------------------------------------------------------------------

/** Slides a full investor deck adds around the YC spine. */
export const LEDGER_DECK_EXTRA_IDS = [
  'cover',
  'why-now',
  'build',
  'insight',
  'competition',
  'close',
] as const;

export type LedgerDeckSlideId =
  | YcDeckSectionId
  | (typeof LEDGER_DECK_EXTRA_IDS)[number];

export interface LedgerClaim {
  readonly claim: string;
  readonly values?: readonly (string | number)[];
  readonly source?: string;
  readonly as_of?: string;
  readonly status?: string;
  readonly attested_by?: string;
  readonly superseded_by?: string;
}

export interface LedgerMetric {
  readonly value?: string | number;
  readonly render?: string;
  readonly as_of?: string;
  readonly source?: string;
  readonly status?: string;
}

export interface FundraisingLedger {
  readonly claims: Readonly<Record<string, LedgerClaim>>;
  readonly metrics: Readonly<Record<string, LedgerMetric>>;
  readonly facts: Readonly<Record<string, LedgerMetric>>;
}

export interface LedgerDeckStat {
  readonly value: string;
  readonly label: string;
}

export interface LedgerDeckStorySlide {
  readonly id: string;
  readonly kicker?: string;
  readonly title: string;
  readonly support?: readonly string[];
  readonly stats?: readonly LedgerDeckStat[];
  readonly table?: {
    readonly head: readonly string[];
    readonly rows: readonly (readonly string[])[];
  };
  readonly note?: string;
  /** Ledger refs: a claim id, `m:<metric>` or `f:<fact>`. */
  readonly cite: readonly string[];
}

export interface LedgerDeckStory {
  readonly schema: string;
  readonly program: string;
  readonly title: string;
  readonly slides: readonly LedgerDeckStorySlide[];
}

export interface LedgerDeckSource {
  readonly ref: string;
  readonly asOf: string | null;
  /** verified | derived | attested | opinion | metric | fact */
  readonly status: string;
}

export interface LedgerDeckSlide extends Omit<YcDeckSection, 'id'> {
  readonly id: LedgerDeckSlideId;
  readonly kicker: string | null;
  readonly stats: readonly LedgerDeckStat[];
  readonly table: LedgerDeckStorySlide['table'] | null;
  readonly note: string | null;
  readonly sources: readonly LedgerDeckSource[];
}

export interface LedgerDeckResult {
  readonly slides: readonly LedgerDeckSlide[];
  readonly issues: readonly string[];
}

/**
 * Claim-like numbers: money, magnitudes, percentages, thousands separators,
 * "N+", and counts on a claim noun. Mirrors the private claims_lint.py NUM so
 * the deck and the application drafts are held to one definition.
 */
export const CLAIM_NUMBER =
  /\$\d[\d,.]*(?:[MK]\b|\/mo(?:nth)?\b| a month\b)?|\b\d[\d,.]*(?:M\+?|K)(?![A-Za-z])|\b\d[\d,.]*\s?(?:%|million|billion)|\b\d{1,3}(?:,\d{3})+\b|\b\d{2,}\+|\b\d+(?:-hour|-day)\b|\b\d+ (?:years|singles|shows|artists|days|months|subscribers|views|plays)\b|\b(?:19|20)\d{2}\b/gu;

export function normalizeClaimNumber(value: string): string {
  return value
    .replace(/ a month$/u, '')
    .replace(/\/month$/u, '')
    .replace(/\/mo$/u, '')
    .replace(/\.$/u, '')
    .toLowerCase()
    .trim();
}

export function claimNumbers(text: string): string[] {
  return [...text.matchAll(CLAIM_NUMBER)].map(match =>
    normalizeClaimNumber(match[0])
  );
}

/** A claim the ledger has retired: superseded, or marked DROPPED/SUPERSEDED. */
export function isRetiredClaim(claim: LedgerClaim): boolean {
  return (
    Boolean(claim.superseded_by) ||
    /^\s*SUPERSEDED\b|\(DROPPED\b|\bDROPPED from all text\b/u.test(claim.claim)
  );
}

const DASH = /[–—]/u;

function slideText(slide: LedgerDeckStorySlide): string[] {
  return [
    slide.kicker ?? '',
    slide.title,
    ...(slide.support ?? []),
    ...(slide.stats ?? []).flatMap(stat => [stat.value, stat.label]),
    ...(slide.table ? [...slide.table.head, ...slide.table.rows.flat()] : []),
    slide.note ?? '',
  ].filter(Boolean);
}

function resolveRef(
  ledger: FundraisingLedger,
  ref: string
): { source: LedgerDeckSource; covers: Set<string> } | string {
  const [kind, key] = ref.includes(':') ? ref.split(':', 2) : ['c', ref];
  if (kind === 'm' || kind === 'f') {
    const row = (kind === 'm' ? ledger.metrics : ledger.facts)[key];
    if (!row) return `unknown ${kind === 'm' ? 'metric' : 'fact'} ${key}`;
    if (row.value === undefined || row.status === 'unknown')
      return `${ref} has no value (status ${row.status ?? 'unset'})`;
    if (!String(row.source ?? '').trim()) return `${ref} has no source`;
    const text = String(row.render ?? row.value);
    const covers = new Set([normalizeClaimNumber(text), ...claimNumbers(text)]);
    if (typeof row.value === 'number') covers.add(String(row.value));
    return {
      source: {
        ref,
        asOf: row.as_of ?? null,
        status: kind === 'm' ? 'metric' : (row.status ?? 'fact'),
      },
      covers,
    };
  }
  const claim = ledger.claims[key];
  if (!claim) return `unknown claim ${key}`;
  if (isRetiredClaim(claim))
    return `claim ${key} is retired${claim.superseded_by ? ` (superseded by ${claim.superseded_by})` : ''}`;
  if (claim.status === 'attested' && !claim.attested_by)
    return `claim ${key} is attested without attested_by`;
  if (!String(claim.source ?? '').trim() && claim.status !== 'attested')
    return `claim ${key} has no source`;
  return {
    source: {
      ref: key,
      asOf: claim.as_of ?? null,
      status: claim.status ?? 'unknown',
    },
    covers: new Set(
      (claim.values ?? []).map(value => normalizeClaimNumber(String(value)))
    ),
  };
}

/**
 * Build the investor deck from a story spec and the claims ledger. The YC
 * spine (problem, solution, traction, market, business model, team, ask) must
 * be present and in order; extra slides may sit anywhere. Every issue is a
 * hard failure: a caller renders only when `issues` is empty.
 */
export function buildLedgerYcDeck(
  story: LedgerDeckStory,
  ledger: FundraisingLedger
): LedgerDeckResult {
  const issues: string[] = [];
  const allowed = new Set<string>([
    ...YC_DECK_SECTION_IDS,
    ...LEDGER_DECK_EXTRA_IDS,
  ]);
  const seen = new Set<string>();
  const slides: LedgerDeckSlide[] = [];

  for (const slide of story.slides) {
    const where = `slide ${slide.id}`;
    if (!allowed.has(slide.id)) {
      issues.push(`${where}: unknown slide id`);
      continue;
    }
    if (seen.has(slide.id)) issues.push(`${where}: duplicate slide id`);
    seen.add(slide.id);
    if (!slide.title.trim().endsWith('.') && slide.id !== 'cover')
      issues.push(`${where}: the dominant sentence must be a full sentence`);

    const covers = new Set<string>();
    const sources: LedgerDeckSource[] = [];
    for (const ref of slide.cite ?? []) {
      const resolved = resolveRef(ledger, ref);
      if (typeof resolved === 'string') {
        issues.push(`${where}: ${resolved}`);
        continue;
      }
      sources.push(resolved.source);
      for (const value of resolved.covers) covers.add(value);
    }

    for (const text of slideText(slide)) {
      if (DASH.test(text)) issues.push(`${where}: em/en dash in "${text}"`);
      for (const number of claimNumbers(text)) {
        if (!covers.has(number))
          issues.push(
            `${where}: "${number}" is not covered by a cited claim or metric`
          );
      }
    }

    slides.push({
      id: slide.id as LedgerDeckSlideId,
      kicker: slide.kicker ?? null,
      dominantSentence: slide.title,
      support: slide.support ?? [],
      stats: slide.stats ?? [],
      table: slide.table ?? null,
      note: slide.note ?? null,
      sources,
    });
  }

  const spine = slides
    .map(slide => slide.id)
    .filter((id): id is YcDeckSectionId =>
      (YC_DECK_SECTION_IDS as readonly string[]).includes(id)
    );
  for (const id of YC_DECK_SECTION_IDS)
    if (!spine.includes(id)) issues.push(`deck: missing YC section ${id}`);
  const ordered = YC_DECK_SECTION_IDS.filter(id => spine.includes(id));
  if (spine.join() !== ordered.join())
    issues.push(
      `deck: YC sections out of order (${spine.join(' > ')}; want ${ordered.join(' > ')})`
    );

  return { slides, issues };
}
