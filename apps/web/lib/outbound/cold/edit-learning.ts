import { createHash } from 'node:crypto';

/**
 * Learning from Tim's edits (outreach engine, phase 1).
 *
 * Every review outcome is stored as a pair: the machine draft Tim saw and what
 * he approved (or why he rejected it). From those pairs this module derives
 * - per-draft edit distance and a diff category;
 * - % approved unchanged with p50/p95 edit distance over a rolling window;
 * - reject reasons;
 * - the per-segment auto-approve gate;
 * - a living style guide (phrases Tim keeps removing or adding) and a
 *   few-shot set, with a deterministic held-out split for evals.
 *
 * Pairs are stored with the person's name and claim link replaced by
 * placeholders, so the learning set holds no PII and generalises.
 */

export const EDIT_PAIR_SCHEMA = 'outbound-edit/v1';

export type EditDecision = 'approved' | 'rejected';

export interface CopyText {
  readonly subject: string | null;
  readonly body: string;
}

export interface EditPair {
  readonly leadId: string;
  readonly segment: string;
  readonly templateVersion: string;
  readonly decision: EditDecision;
  readonly before: CopyText;
  /** What Tim approved; null for a reject. */
  readonly after: CopyText | null;
  readonly rejectReason: string | null;
  readonly at: Date;
}

export const EDIT_CATEGORIES = [
  'unchanged',
  'subject',
  'greeting',
  'signoff',
  'link',
  'fact',
  'cut',
  'added',
  'reworded',
  'punctuation',
] as const;
export type EditCategory = (typeof EDIT_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace the name and claim link with placeholders before storing a pair. */
export function redactCopy(
  copy: CopyText,
  identity: {
    readonly names: readonly string[];
    readonly claimUrl: string | null;
  }
): CopyText {
  const apply = (text: string): string => {
    let out = text;
    if (identity.claimUrl)
      out = out.replaceAll(identity.claimUrl, '{claimLink}');
    out = out.replace(/https?:\/\/\S*\/claim\/\S+/g, '{claimLink}');
    for (const name of [...identity.names].sort(
      (a, b) => b.length - a.length
    )) {
      const trimmed = name.trim();
      if (trimmed.length < 2) continue;
      out = out.replace(
        new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'g'),
        '{name}'
      );
    }
    return out;
  };
  return {
    subject: copy.subject === null ? null : apply(copy.subject),
    body: apply(copy.body),
  };
}

// ---------------------------------------------------------------------------
// Distance and categories
// ---------------------------------------------------------------------------

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}{}']+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** Word-level Levenshtein distance. */
export function wordEditDistance(a: string, b: string): number {
  const x = tokenize(a);
  const y = tokenize(b);
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost
      );
    }
    previous = current;
  }
  return previous[y.length] ?? 0;
}

function joined(copy: CopyText): string {
  return `${copy.subject ?? ''}\n${copy.body}`;
}

/** 0 when unchanged, 1 for a full rewrite (or a reject). */
export function normalizedEditDistance(pair: EditPair): number {
  if (pair.decision === 'rejected' || !pair.after) return 1;
  const a = joined(pair.before);
  const b = joined(pair.after);
  const longest = Math.max(tokenize(a).length, tokenize(b).length);
  if (longest === 0) return 0;
  return Math.min(1, wordEditDistance(a, b) / longest);
}

function lines(body: string): string[] {
  return body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

/** Every category that describes what changed. */
export function classifyEdit(
  before: CopyText,
  after: CopyText
): EditCategory[] {
  if (
    (before.subject ?? '') === (after.subject ?? '') &&
    before.body === after.body
  )
    return ['unchanged'];
  const categories = new Set<EditCategory>();
  if ((before.subject ?? '').trim() !== (after.subject ?? '').trim())
    categories.add('subject');
  const b = lines(before.body);
  const a = lines(after.body);
  if (b[0] !== a[0]) categories.add('greeting');
  if (b.at(-1) !== a.at(-1)) categories.add('signoff');
  const linkCount = (text: string) =>
    (text.match(/https?:\/\/|\{claimLink\}/g) ?? []).length;
  if (linkCount(before.body) !== linkCount(after.body)) categories.add('link');
  const numbers = (text: string) => (text.match(/\d+/g) ?? []).join(',');
  if (numbers(before.body) !== numbers(after.body)) categories.add('fact');
  const tb = tokenize(before.body).length;
  const ta = tokenize(after.body).length;
  if (ta < tb * 0.85) categories.add('cut');
  else if (ta > tb * 1.15) categories.add('added');
  const words = (text: string) =>
    tokenize(text)
      .filter(t => /[\p{L}\p{N}]/u.test(t))
      .join(' ');
  if (words(before.body) === words(after.body)) categories.add('punctuation');
  else if (!categories.has('cut') && !categories.has('added'))
    categories.add('reworded');
  return [...categories];
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Nearest-rank percentile over a sorted copy; null for an empty list. */
export function percentile(
  values: readonly number[],
  p: number
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? null;
}

export interface SegmentLearning {
  readonly segment: string;
  readonly templateVersion: string | null;
  /** Reviews in the window (approved + rejected). */
  readonly reviewed: number;
  readonly approved: number;
  readonly approvedUnchanged: number;
  /** approvedUnchanged / reviewed; null with no reviews. */
  readonly unchangedRate: number | null;
  readonly editDistanceP50: number | null;
  readonly editDistanceP95: number | null;
  readonly rejectReasons: Readonly<Record<string, number>>;
  readonly categories: Readonly<Record<string, number>>;
}

/**
 * Rolling-window summary per segment: the newest `window` reviews on the
 * segment's newest template version. Older templates do not count toward a
 * new template's record.
 */
export function summarizeSegment(
  pairs: readonly EditPair[],
  segment: string,
  window = 100
): SegmentLearning {
  const inSegment = pairs
    .filter(pair => pair.segment === segment)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const templateVersion = inSegment[0]?.templateVersion ?? null;
  const recent = inSegment
    .filter(pair => pair.templateVersion === templateVersion)
    .slice(0, window);
  const distances = recent.map(normalizedEditDistance);
  const rejectReasons: Record<string, number> = {};
  const categories: Record<string, number> = {};
  let approved = 0;
  let approvedUnchanged = 0;
  for (const pair of recent) {
    if (pair.decision === 'rejected' || !pair.after) {
      const reason = pair.rejectReason ?? 'other';
      rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
      continue;
    }
    approved += 1;
    const kinds = classifyEdit(pair.before, pair.after);
    if (kinds.includes('unchanged')) approvedUnchanged += 1;
    for (const kind of kinds) categories[kind] = (categories[kind] ?? 0) + 1;
  }
  return {
    segment,
    templateVersion,
    reviewed: recent.length,
    approved,
    approvedUnchanged,
    unchangedRate: recent.length ? approvedUnchanged / recent.length : null,
    editDistanceP50: percentile(distances, 50),
    editDistanceP95: percentile(distances, 95),
    rejectReasons,
    categories,
  };
}

export function summarizeAll(
  pairs: readonly EditPair[],
  window = 100
): SegmentLearning[] {
  const segments = [...new Set(pairs.map(pair => pair.segment))].sort();
  return segments.map(segment => summarizeSegment(pairs, segment, window));
}

// ---------------------------------------------------------------------------
// Auto-approve gate
// ---------------------------------------------------------------------------

/** Proposed by the outreach design; Tim can raise it. */
export const AUTO_APPROVE_MIN_REVIEWS = 50;

export interface DeliverabilityHealth {
  readonly sent: number;
  readonly bounceRate: number | null;
  readonly complaintRate: number | null;
}

export const AUTO_APPROVE_HEALTH = {
  maxBounceRate: 0.02,
  maxComplaintRate: 0.001,
} as const;

export type AutoApproveBlock =
  | 'kill_switch'
  | 'too_few_reviews'
  | 'edits_requested'
  | 'deliverability_unknown'
  | 'bounce_high'
  | 'complaints_high'
  | 'template_changed';

export interface AutoApproveVerdict {
  readonly segment: string;
  readonly mode: 'auto' | 'review';
  readonly blocks: readonly AutoApproveBlock[];
  /** Plain words for the Ovie card. */
  readonly summary: string;
}

/**
 * Auto-send turns on for a segment only when, on the current template, the
 * newest N reviews have a p95 edit distance of zero (at least 95% approved
 * with no change, rejects counted as full changes) and deliverability is
 * healthy. It falls back to review the moment any condition fails: edits
 * creep up, complaints or bounces rise, the template changes (which resets
 * the count) or Tim flips the kill switch.
 */
export function evaluateAutoApprove(input: {
  readonly learning: SegmentLearning;
  readonly health: DeliverabilityHealth;
  readonly killSwitch: boolean;
  readonly currentTemplateVersion: string;
  readonly minReviews?: number;
}): AutoApproveVerdict {
  const min = input.minReviews ?? AUTO_APPROVE_MIN_REVIEWS;
  const { learning, health } = input;
  const blocks: AutoApproveBlock[] = [];
  if (input.killSwitch) blocks.push('kill_switch');
  if (learning.templateVersion !== input.currentTemplateVersion)
    blocks.push('template_changed');
  if (learning.reviewed < min) blocks.push('too_few_reviews');
  else if ((learning.editDistanceP95 ?? 1) > 0) blocks.push('edits_requested');
  if (health.bounceRate === null || health.complaintRate === null)
    blocks.push('deliverability_unknown');
  else {
    if (health.bounceRate >= AUTO_APPROVE_HEALTH.maxBounceRate)
      blocks.push('bounce_high');
    if (health.complaintRate >= AUTO_APPROVE_HEALTH.maxComplaintRate)
      blocks.push('complaints_high');
  }
  const mode = blocks.length === 0 ? 'auto' : 'review';
  const unchanged = `${learning.approvedUnchanged} of ${learning.reviewed} approved unchanged`;
  const summary =
    mode === 'auto'
      ? `Auto: ${unchanged} on ${learning.templateVersion}.`
      : `Review: ${unchanged}; needs ${min} with no edits at p95.`;
  return { segment: learning.segment, mode, blocks, summary };
}

// ---------------------------------------------------------------------------
// Style guide, few-shot set and held-out evals
// ---------------------------------------------------------------------------

function ngrams(text: string, n: number): Set<string> {
  const tokens = tokenize(text).filter(token => /[\p{L}\p{N}{}]/u.test(token));
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i += 1)
    out.add(tokens.slice(i, i + n).join(' '));
  return out;
}

export interface StyleGuide {
  /** Phrases Tim removed in at least `minSupport` edits. */
  readonly avoid: readonly {
    readonly phrase: string;
    readonly count: number;
  }[];
  /** Phrases Tim added in at least `minSupport` edits. */
  readonly prefer: readonly {
    readonly phrase: string;
    readonly count: number;
  }[];
  readonly basedOn: number;
}

/** Mine phrases Tim consistently removes or adds (2- and 3-grams). */
export function mineStyleGuide(
  pairs: readonly EditPair[],
  minSupport = 3
): StyleGuide {
  const removed = new Map<string, number>();
  const added = new Map<string, number>();
  let basedOn = 0;
  for (const pair of pairs) {
    if (pair.decision !== 'approved' || !pair.after) continue;
    if (pair.before.body === pair.after.body) continue;
    basedOn += 1;
    for (const n of [2, 3]) {
      const before = ngrams(pair.before.body, n);
      const after = ngrams(pair.after.body, n);
      for (const gram of before)
        if (!after.has(gram)) removed.set(gram, (removed.get(gram) ?? 0) + 1);
      for (const gram of after)
        if (!before.has(gram)) added.set(gram, (added.get(gram) ?? 0) + 1);
    }
  }
  const top = (map: Map<string, number>) =>
    [...map.entries()]
      .filter(([, count]) => count >= minSupport)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 25)
      .map(([phrase, count]) => ({ phrase, count }));
  return { avoid: top(removed), prefer: top(added), basedOn };
}

/** Deterministic split by lead id: the same lead always lands on one side. */
export function isHeldOut(leadId: string, ratio = 0.2): boolean {
  const byte =
    createHash('sha256').update(`holdout:${leadId}`).digest()[0] ?? 0;
  return byte / 256 < ratio;
}

/** Newest edited approvals outside the held-out set, one per category first. */
export function selectFewShot(pairs: readonly EditPair[], k = 6): EditPair[] {
  const pool = pairs
    .filter(
      pair =>
        pair.decision === 'approved' &&
        pair.after &&
        pair.after.body !== pair.before.body &&
        !isHeldOut(pair.leadId)
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const picked: EditPair[] = [];
  const seen = new Set<string>();
  for (const pair of pool) {
    if (picked.length >= k) break;
    const key = classifyEdit(pair.before, pair.after as CopyText).join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(pair);
  }
  for (const pair of pool) {
    if (picked.length >= k) break;
    if (!picked.includes(pair)) picked.push(pair);
  }
  return picked;
}

/**
 * Eval on held-out reviews: how far a drafter's output is from what Tim
 * actually approved. Lower is better; 0 means Tim would not have changed it.
 */
export function evaluateDrafter(
  pairs: readonly EditPair[],
  draft: (pair: EditPair) => CopyText
): {
  readonly n: number;
  readonly meanDistance: number | null;
  readonly unchangedRate: number | null;
} {
  const held = pairs.filter(
    pair => pair.decision === 'approved' && pair.after && isHeldOut(pair.leadId)
  );
  if (held.length === 0)
    return { n: 0, meanDistance: null, unchangedRate: null };
  let total = 0;
  let unchanged = 0;
  for (const pair of held) {
    const candidate = draft(pair);
    const distance = normalizedEditDistance({
      ...pair,
      before: candidate,
    });
    total += distance;
    if (distance === 0) unchanged += 1;
  }
  return {
    n: held.length,
    meanDistance: total / held.length,
    unchangedRate: unchanged / held.length,
  };
}
