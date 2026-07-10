/**
 * External opportunity detector (JOV-2205).
 *
 * Normalizes trusted event/festival + commerce signals, collapses duplicates
 * per artist/collaborator/time window, and ranks artist-scoped opportunities.
 */

import type {
  ArtistOpportunity,
  ExternalSignalInput,
  NormalizedExternalSignal,
  OpportunityKind,
  SignalSourceKind,
} from './types';

const MS_PER_DAY = 86_400_000;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '');
}

/** Calendar day key in UTC for window bucketing. */
export function utcDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'invalid';
  return d.toISOString().slice(0, 10);
}

/**
 * Dedupe key: artist + collaborator + source kind + start-day window.
 * Multiple observations of the same EDC weekend collapse into one bucket.
 */
export function buildSignalDedupeKey(input: {
  readonly artistId: string;
  readonly collaboratorId?: string | null;
  readonly sourceKind: SignalSourceKind;
  readonly startsAt: string;
  readonly eventName?: string | null;
}): string {
  const collab = input.collaboratorId?.trim() || 'solo';
  const event = slugPart(input.eventName ?? 'event') || 'event';
  return [
    slugPart(input.artistId) || 'artist',
    slugPart(collab),
    input.sourceKind,
    event,
    utcDayKey(input.startsAt),
  ].join('|');
}

export function normalizeExternalSignal(
  input: ExternalSignalInput
): NormalizedExternalSignal {
  const dedupeKey = buildSignalDedupeKey({
    artistId: input.artistId,
    collaboratorId: input.collaboratorId,
    sourceKind: input.sourceKind,
    startsAt: input.startsAt,
    eventName: input.eventName,
  });

  const id = `sig_${slugPart(dedupeKey)}_${slugPart(input.observedAt)}`;

  return {
    id,
    dedupeKey,
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl.trim(),
    sourceLabel: input.sourceLabel.trim(),
    artistId: input.artistId.trim(),
    artistName: input.artistName.trim(),
    collaboratorId: input.collaboratorId?.trim() ?? null,
    collaboratorName: input.collaboratorName?.trim() ?? null,
    eventName: input.eventName?.trim() ?? null,
    venue: input.venue?.trim() ?? null,
    city: input.city?.trim() ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    observedAt: input.observedAt,
    confidence: clampConfidence(input.confidence),
    expiryAt: input.expiryAt,
    tags: Object.freeze([...(input.tags ?? [])]),
  };
}

function isFresh(signal: NormalizedExternalSignal, now: Date): boolean {
  const expiry = new Date(signal.expiryAt).getTime();
  if (Number.isNaN(expiry)) return false;
  return expiry >= now.getTime();
}

function kindForSource(sourceKind: SignalSourceKind): OpportunityKind {
  switch (sourceKind) {
    case 'event_festival':
      return 'festival_attention';
    case 'commerce_window':
      return 'commerce_window';
    case 'collaborator':
      return 'collaborator_moment';
  }
}

function buildTitle(signals: readonly NormalizedExternalSignal[]): string {
  const primary = signals[0];
  if (!primary) return 'Untitled opportunity';

  if (primary.collaboratorName && primary.eventName) {
    return `${primary.collaboratorName} at ${primary.eventName}`;
  }
  if (primary.eventName) {
    return primary.eventName;
  }
  if (primary.sourceKind === 'commerce_window') {
    return primary.sourceLabel || 'Commerce window';
  }
  return primary.sourceLabel || 'External opportunity';
}

function buildWhy(signals: readonly NormalizedExternalSignal[]): string {
  const primary = signals[0];
  if (!primary) return '';

  const parts: string[] = [];
  if (primary.collaboratorName && primary.eventName) {
    parts.push(
      `${primary.collaboratorName} is drawing attention at ${primary.eventName}`
    );
  } else if (primary.eventName) {
    parts.push(`${primary.eventName} is an active event window`);
  } else {
    parts.push(primary.sourceLabel);
  }

  if (primary.city) {
    parts.push(`in ${primary.city}`);
  }

  const commerce = signals.find(s => s.sourceKind === 'commerce_window');
  if (commerce && primary.sourceKind !== 'commerce_window') {
    parts.push(`overlaps ${commerce.sourceLabel}`);
  }

  return `${parts.join(' ')}.`;
}

function rankScore(
  signals: readonly NormalizedExternalSignal[],
  now: Date
): number {
  if (signals.length === 0) return 0;

  const maxConfidence = Math.max(...signals.map(s => s.confidence));
  const diversityBonus = Math.min(
    0.2,
    (new Set(signals.map(s => s.sourceKind)).size - 1) * 0.1
  );

  const soonest = Math.min(...signals.map(s => new Date(s.startsAt).getTime()));
  const daysUntil = (soonest - now.getTime()) / MS_PER_DAY;
  // Prefer windows starting within the next 14 days.
  const timing =
    daysUntil < 0
      ? 0.4
      : daysUntil <= 3
        ? 1
        : daysUntil <= 14
          ? 0.8
          : daysUntil <= 30
            ? 0.5
            : 0.2;

  return Number(
    (maxConfidence * 0.6 + timing * 0.3 + diversityBonus + 0.1).toFixed(4)
  );
}

/**
 * Collapse normalized signals into one opportunity per dedupe key,
 * then rank freshest artist-scoped opportunities.
 */
export function collapseSignalsToOpportunities(
  signals: readonly NormalizedExternalSignal[],
  options: { readonly now?: Date; readonly artistId?: string } = {}
): ArtistOpportunity[] {
  const now = options.now ?? new Date();
  const filtered = signals.filter(s => {
    if (!isFresh(s, now)) return false;
    if (options.artistId && s.artistId !== options.artistId) return false;
    return true;
  });

  const buckets = new Map<string, NormalizedExternalSignal[]>();
  for (const signal of filtered) {
    const list = buckets.get(signal.dedupeKey) ?? [];
    list.push(signal);
    buckets.set(signal.dedupeKey, list);
  }

  const opportunities: ArtistOpportunity[] = [];

  for (const [dedupeKey, bucket] of buckets) {
    // Prefer highest confidence, then newest observation.
    const sorted = [...bucket].sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (
        new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
      );
    });

    const primary = sorted[0];
    if (!primary) continue;

    const starts = sorted.map(s => new Date(s.startsAt).getTime());
    const ends = sorted.map(s =>
      s.endsAt ? new Date(s.endsAt).getTime() : new Date(s.expiryAt).getTime()
    );
    const windowStartsAt = new Date(Math.min(...starts)).toISOString();
    const windowEndsAt = new Date(Math.max(...ends)).toISOString();
    const confidence = Math.max(...sorted.map(s => s.confidence));
    const kind = kindForSource(primary.sourceKind);

    opportunities.push({
      id: `opp_${slugPart(dedupeKey)}`,
      kind,
      artistId: primary.artistId,
      title: buildTitle(sorted),
      why: buildWhy(sorted),
      rankScore: rankScore(sorted, now),
      confidence,
      windowStartsAt,
      windowEndsAt,
      signalIds: sorted.map(s => s.id),
      collaboratorId: primary.collaboratorId,
      collaboratorName: primary.collaboratorName,
      sourceUrls: Object.freeze([
        ...new Set(sorted.map(s => s.sourceUrl).filter(Boolean)),
      ]),
    });
  }

  return opportunities.sort((a, b) => b.rankScore - a.rankScore);
}

/** Adapter entry: raw connector payloads → ranked opportunities. */
export function detectOpportunitiesFromSignals(
  inputs: readonly ExternalSignalInput[],
  options: { readonly now?: Date; readonly artistId?: string } = {}
): ArtistOpportunity[] {
  const normalized = inputs.map(normalizeExternalSignal);
  return collapseSignalsToOpportunities(normalized, options);
}
