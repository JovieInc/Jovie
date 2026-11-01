/**
 * Release ledger: the one classification and audience-projection layer for
 * every "what shipped" surface (public changelog, What's New, desktop notes,
 * Ovie shipping view).
 *
 * Source of truth stays the verified production publication (receipts in
 * CHANGELOG.md, bound to a Production Verified marker). This module only
 * classifies each verified merge and renders the version each audience needs.
 * It has no imports and uses erasable TypeScript only, so the publisher script
 * can import it directly under Node's type stripping.
 *
 * Audiences
 * - customer: Jovie in-app + jov.ie/changelog. Published customer stories plus
 *   one short "Under the hood" line. Never PR numbers, tooling or embargoed work.
 * - ops: Ovie. Every verified merge, grouped by area, with PR links.
 */

export const LEDGER_KINDS = [
  'feature',
  'fix',
  'perf',
  'security',
  'maintenance',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_THEMES = [
  'reliability',
  'speed',
  'security',
  'quality',
  'tooling',
] as const;
export type LedgerTheme = (typeof LEDGER_THEMES)[number];

export const LEDGER_AREAS = [
  'website',
  'app',
  'mobile',
  'desktop',
  'billing',
  'ai',
  'data',
  'ovie',
  'delivery',
  'dependencies',
  'docs',
  'other',
] as const;
export type LedgerArea = (typeof LEDGER_AREAS)[number];

export interface LedgerInput {
  readonly number: number;
  readonly title: string;
  readonly sha?: string;
  readonly url?: string;
  readonly mergedAt?: string;
  /** Production Controller run that verified this merge. */
  readonly runUrl?: string;
  /** Security work stays out of customer views until this instant. */
  readonly embargoUntil?: string | null;
  /** Id of the published customer story this merge produced, if any. */
  readonly storyId?: string | null;
}

export interface LedgerEntry extends LedgerInput {
  readonly kind: LedgerKind;
  readonly area: LedgerArea;
  readonly theme: LedgerTheme;
  /** Operator-facing one-line summary: the subject without type/scope noise. */
  readonly opsSummary: string;
}

const TITLE_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

const AREA_RULES: readonly (readonly [LedgerArea, RegExp])[] = [
  ['dependencies', /\b(?:deps?|dependabot|bump|renovate|lockfile)\b/i],
  [
    'billing',
    /\b(?:billing|stripe|checkout|pricing|subscription|payments?)\b/i,
  ],
  ['mobile', /\b(?:ios|iphone|android|testflight)\b/i],
  ['desktop', /\b(?:desktop|electron|mac|macos|sparkle)\b/i],
  ['ovie', /\b(?:ovie|admin|hud|symphony|summer|mesh|fleet)\b/i],
  [
    'delivery',
    /\b(?:ci|lanes?|release|merge[- ]queue|controller|workflow|pipeline|hook|lint|biome|vitest|playwright|storybook|build|turbo|gem)\b/i,
  ],
  ['ai', /\b(?:chat|ai|model|llm|agent|jev|dictation|prompt)\b/i],
  [
    'data',
    /\b(?:db|database|migration|schema|drizzle|ingest|resolver|insights)\b/i,
  ],
  ['website', /\b(?:marketing|homepage|changelog|seo|landing|blog)\b/i],
  ['docs', /\b(?:docs?|readme|playbook|skills?)\b/i],
  [
    'app',
    /\b(?:web|app|inbox|profile|smart-links?|library|releases?|audience|shell|dashboard|onboarding|settings)\b/i,
  ],
];

const SECURITY_RE =
  /\b(?:security|cve-\d|ghsa-|vulnerab\w*|xss|csrf|ssrf|injection|exploit|embargo|auth bypass|secret leak)\b/i;

const NOISE_TYPES = new Set([
  'chore',
  'ci',
  'build',
  'test',
  'tests',
  'refactor',
  'style',
  'docs',
  'revert',
  'deps',
]);

/** Areas that are never a customer product surface. */
const INTERNAL_AREAS = new Set<LedgerArea>([
  'ovie',
  'delivery',
  'dependencies',
  'docs',
]);

function pickArea(scope: string, subject: string): LedgerArea {
  // Scope is the author's own statement of area; trust it before the subject.
  for (const text of [scope, subject]) {
    if (!text) continue;
    for (const [area, pattern] of AREA_RULES) {
      if (pattern.test(text)) return area;
    }
  }
  return 'other';
}

/**
 * Theme is derived, never stored, so a rule change re-reads old receipts.
 * Work in internal areas, and maintenance anywhere, is invisible to customers.
 */
export function themeFor(kind: LedgerKind, area: LedgerArea): LedgerTheme {
  if (kind === 'security') return 'security';
  if (kind === 'maintenance' || INTERNAL_AREAS.has(area)) return 'tooling';
  if (kind === 'perf') return 'speed';
  if (kind === 'fix') return 'reliability';
  return 'quality';
}

export function classifyLedgerEntry(input: LedgerInput): LedgerEntry {
  const raw = input.title.trim();
  const parsed = TITLE_RE.exec(raw);
  const type = (parsed?.[1] ?? '').toLowerCase();
  const scope = parsed?.[2] ?? '';
  const subject = (parsed?.[4] ?? raw)
    .replace(/\s*\((?:JOV-\d+|#\d+)\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const area = pickArea(scope, subject);

  let kind: LedgerKind;
  if (SECURITY_RE.test(raw) || type === 'security') kind = 'security';
  else if (type === 'perf') kind = 'perf';
  else if (NOISE_TYPES.has(type)) kind = 'maintenance';
  else if (type === 'fix' || type === 'hotfix') kind = 'fix';
  else if (type === 'feat' || type === 'feature') kind = 'feature';
  else kind = 'maintenance';

  const theme = themeFor(kind, area);

  return { ...input, kind, area, theme, opsSummary: subject };
}

export function isEmbargoed(entry: LedgerEntry, now: Date): boolean {
  if (entry.kind !== 'security') return false;
  // Security work is held until an explicit, elapsed embargo date. No date
  // means undisclosed, never "free to publish".
  if (!entry.embargoUntil) return true;
  const until = Date.parse(entry.embargoUntil);
  return !Number.isFinite(until) || until > now.getTime();
}

/** Internal means a customer would not recognize it as a product change. */
export function isNoise(entry: LedgerEntry): boolean {
  return entry.kind === 'maintenance' || INTERNAL_AREAS.has(entry.area);
}

const THEME_PHRASE: Record<LedgerTheme, string> = {
  reliability: 'fewer rough edges',
  speed: 'faster pages and actions',
  security: 'tighter security',
  quality: 'extra polish',
  // Never shown: summarizeUnderTheHood skips tooling.
  tooling: '',
};

export interface UnderTheHood {
  readonly total: number;
  readonly themes: Readonly<Partial<Record<LedgerTheme, number>>>;
  /** Plain-language single line, or '' when there is nothing to say. */
  readonly line: string;
}

/**
 * Consolidate everything that did not become a customer story into one short
 * line. Embargoed security work is excluded entirely: it must not even move
 * a count.
 */
export function summarizeUnderTheHood(
  entries: readonly LedgerEntry[],
  now: Date
): UnderTheHood {
  const themes: Partial<Record<LedgerTheme, number>> = {};
  let total = 0;
  for (const entry of entries) {
    if (entry.storyId) continue;
    if (isEmbargoed(entry, now)) continue;
    if (entry.theme === 'tooling') continue;
    themes[entry.theme] = (themes[entry.theme] ?? 0) + 1;
    total += 1;
  }
  if (total === 0) return { total, themes, line: '' };
  const top = (Object.entries(themes) as [LedgerTheme, number][])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([theme]) => THEME_PHRASE[theme]);
  const joined =
    top.length > 1
      ? `${top.slice(0, -1).join(', ')} and ${top.at(-1)}`
      : (top[0] ?? '');
  return {
    total,
    themes,
    line: `Under the hood: ${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`,
  };
}

export type LedgerAudience = 'customer' | 'ops';

export interface OpsGroup {
  readonly area: LedgerArea;
  readonly entries: readonly LedgerEntry[];
}

export interface AudienceView {
  readonly audience: LedgerAudience;
  /** Customer: story-backed entries only. Ops: every entry. */
  readonly entries: readonly LedgerEntry[];
  readonly underTheHood: UnderTheHood | null;
  readonly groups: readonly OpsGroup[];
  /** Embargoed entries withheld from this audience (count only). */
  readonly withheld: number;
}

export function renderAudienceView(
  inputs: readonly LedgerInput[],
  audience: LedgerAudience,
  now: Date = new Date()
): AudienceView {
  const all = inputs.map(classifyLedgerEntry);
  if (audience === 'ops') {
    const byArea = new Map<LedgerArea, LedgerEntry[]>();
    for (const entry of all) {
      const list = byArea.get(entry.area) ?? [];
      list.push(entry);
      byArea.set(entry.area, list);
    }
    const groups = LEDGER_AREAS.filter(area => byArea.has(area)).map(area => ({
      area,
      entries: [...(byArea.get(area) ?? [])].sort(
        (a, b) => b.number - a.number
      ),
    }));
    return { audience, entries: all, underTheHood: null, groups, withheld: 0 };
  }
  const visible = all.filter(entry => !isEmbargoed(entry, now));
  return {
    audience,
    entries: visible.filter(entry => entry.storyId),
    underTheHood: summarizeUnderTheHood(visible, now),
    groups: [],
    withheld: all.length - visible.length,
  };
}

const LEDGER_NOTE_RE = /<!--\s*release-ledger\/v1\s+(\{.*?\})\s*-->/s;

/**
 * Optional hidden PR-body block carrying release metadata that cannot be
 * inferred from the title, e.g. `<!-- release-ledger/v1 {"embargoUntil":"2026-11-01T00:00:00Z"} -->`.
 * Malformed blocks are ignored; a security title with no block stays embargoed.
 */
export function readLedgerNote(body: string | null | undefined): {
  readonly embargoUntil?: string;
} {
  const match = LEDGER_NOTE_RE.exec(body ?? '');
  if (!match?.[1]) return {};
  try {
    const parsed = JSON.parse(match[1]) as { embargoUntil?: unknown };
    return typeof parsed.embargoUntil === 'string' &&
      Number.isFinite(Date.parse(parsed.embargoUntil))
      ? { embargoUntil: parsed.embargoUntil }
      : {};
  } catch {
    return {};
  }
}

export interface ReceiptRow {
  readonly n: number;
  readonly k: LedgerKind;
  readonly a: LedgerArea;
  readonly s?: string;
  readonly e?: string;
}

/** Rehydrate a persisted row; titles are never stored, so ops text is empty. */
export function fromReceiptRow(row: ReceiptRow): LedgerEntry {
  return {
    number: row.n,
    title: '',
    kind: row.k,
    area: row.a,
    theme: themeFor(row.k, row.a),
    opsSummary: '',
    storyId: row.s ?? null,
    embargoUntil: row.e ?? null,
  };
}

/** Compact, receipt-safe row: number, kind, area, theme, story link. */
export function toReceiptRow(entry: LedgerEntry): ReceiptRow {
  return {
    n: entry.number,
    k: entry.kind,
    a: entry.area,
    ...(entry.storyId ? { s: entry.storyId } : {}),
    ...(entry.embargoUntil ? { e: entry.embargoUntil } : {}),
  };
}

// ---------------------------------------------------------------------------
// Plain-language lint for customer copy (editorial drafts and human overrides).
// ---------------------------------------------------------------------------

export interface LanguageViolation {
  readonly rule: string;
  readonly detail: string;
}

const JARGON = [
  'refactor',
  'middleware',
  'schema',
  'endpoint',
  'webhook',
  'idempotent',
  'telemetry',
  'ci',
  'lint',
  'monorepo',
  'e2e',
  'sdk',
  'regression',
  'feature flag',
  'rollout gate',
];

const HEDGES =
  /\b(?:various|several|numerous|improved? (?:things|stuff)|etc\.?)/i;

/**
 * Customer copy is outcome-first and plain: it says what the person can now do
 * or what stopped going wrong. Returns [] when the sentence is acceptable.
 */
export function lintPlainLanguage(text: string): LanguageViolation[] {
  const violations: LanguageViolation[] = [];
  const trimmed = text.trim();
  if (!trimmed) return [{ rule: 'empty', detail: 'No text' }];
  if (trimmed.length > 240)
    violations.push({
      rule: 'length',
      detail: `${trimmed.length} characters; keep it under 240`,
    });
  if (/\bJOV-\d+\b|#\d{3,}|\b[0-9a-f]{7,40}\b/i.test(trimmed))
    violations.push({
      rule: 'internal-reference',
      detail: 'Issue ids, PR numbers and hashes stay out of customer copy',
    });
  for (const word of JARGON) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(trimmed))
      violations.push({ rule: 'jargon', detail: word });
  }
  if (/[a-z]+_[a-z]+|[a-z]+[A-Z][a-z]+[A-Z]|`/.test(trimmed))
    violations.push({
      rule: 'code-token',
      detail: 'Identifiers and code formatting read as engineering',
    });
  if (HEDGES.test(trimmed))
    violations.push({ rule: 'vague', detail: 'Name the specific outcome' });
  if (
    /^(?:fix(?:ed|es)?|refactor|chore|update[sd]?|add(?:ed|s)?)\b/i.test(
      trimmed
    )
  )
    violations.push({
      rule: 'outcome-first',
      detail: 'Lead with what the person can do, not the change type',
    });
  return violations;
}
