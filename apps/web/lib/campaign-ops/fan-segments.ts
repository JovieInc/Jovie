/**
 * Fan segment builder from Jovie Link / audience activity (JOV-2207).
 *
 * Pure predicates over fan activity records. Stable definition ids, refreshable
 * previews, and graceful missing-data notes for campaign targeting.
 */

import type {
  FanActivityRecord,
  SegmentDefinition,
  SegmentDimension,
  SegmentMemberSample,
  SegmentPreview,
} from './types';

const MS_PER_DAY = 86_400_000;

function daysBetween(iso: string, now: Date): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / MS_PER_DAY;
}

function hasGenreMatch(
  record: FanActivityRecord,
  genreTags: readonly string[] | undefined
): boolean {
  if (!genreTags || genreTags.length === 0) return true;
  const tags = record.genreTags ?? [];
  if (tags.length === 0) return false;
  const wanted = new Set(genreTags.map(g => g.toLowerCase()));
  return tags.some(t => wanted.has(t.toLowerCase()));
}

export function evaluateSegmentMember(
  record: FanActivityRecord,
  definition: SegmentDefinition,
  now: Date = new Date()
): {
  readonly matches: boolean;
  readonly dimensions: readonly SegmentDimension[];
} {
  const matched: SegmentDimension[] = [];
  const dims = definition.dimensions;

  for (const dim of dims) {
    switch (dim) {
      case 'genre_affinity': {
        if (hasGenreMatch(record, definition.genreTags)) {
          matched.push(dim);
        }
        break;
      }
      case 'link_activity': {
        const min = definition.minLinkClicks ?? 1;
        if ((record.linkClickCount ?? 0) >= min) {
          matched.push(dim);
        }
        break;
      }
      case 'buyer': {
        if (record.isBuyer === true) {
          matched.push(dim);
        }
        break;
      }
      case 'subscriber': {
        if (record.isSubscriber === true) {
          matched.push(dim);
        }
        break;
      }
      case 'recency': {
        const maxDays = definition.recencyDays ?? 30;
        const days = daysBetween(record.lastActiveAt, now);
        if (days !== null && days <= maxDays) {
          matched.push(dim);
        }
        break;
      }
    }
  }

  // All declared dimensions must match (AND).
  const matches = dims.length > 0 && dims.every(d => matched.includes(d));

  return { matches, dimensions: matched };
}

function collectMissingDataNotes(
  members: readonly FanActivityRecord[],
  definition: SegmentDefinition
): string[] {
  const notes: string[] = [];
  if (members.length === 0) {
    notes.push('No audience activity available for this artist yet.');
    return notes;
  }

  if (definition.dimensions.includes('genre_affinity')) {
    const missingGenre = members.filter(
      m => !m.genreTags || m.genreTags.length === 0
    ).length;
    if (missingGenre > 0) {
      notes.push(
        `${missingGenre} members lack genre affinity tags and cannot match genre filters.`
      );
    }
  }

  if (definition.dimensions.includes('buyer')) {
    const unknownBuyer = members.filter(m => m.isBuyer === undefined).length;
    if (unknownBuyer > 0) {
      notes.push(
        `${unknownBuyer} members have unknown purchase state; only confirmed buyers are counted.`
      );
    }
  }

  if (definition.dimensions.includes('subscriber')) {
    const unknownSub = members.filter(m => m.isSubscriber === undefined).length;
    if (unknownSub > 0) {
      notes.push(
        `${unknownSub} members have unknown subscription state; only confirmed subscribers are counted.`
      );
    }
  }

  if (definition.dimensions.includes('link_activity')) {
    const noClicks = members.filter(
      m => m.linkClickCount === undefined || m.linkClickCount === 0
    ).length;
    if (noClicks === members.length) {
      notes.push(
        'No Jovie Link click activity recorded for this audience yet.'
      );
    }
  }

  return notes;
}

/**
 * Preview a segment: size, sample members, and missing-data explanations.
 */
export function previewSegment(
  definition: SegmentDefinition,
  members: readonly FanActivityRecord[],
  options: {
    readonly now?: Date;
    readonly sampleSize?: number;
  } = {}
): SegmentPreview {
  const now = options.now ?? new Date();
  const sampleSize = options.sampleSize ?? 5;
  const samples: SegmentMemberSample[] = [];

  for (const member of members) {
    const result = evaluateSegmentMember(member, definition, now);
    if (!result.matches) continue;
    if (samples.length < sampleSize) {
      samples.push({
        memberId: member.memberId,
        matchedDimensions: result.dimensions,
      });
    }
  }

  // Full size count (not capped by sample).
  let size = 0;
  for (const member of members) {
    if (evaluateSegmentMember(member, definition, now).matches) {
      size += 1;
    }
  }

  return {
    definitionId: definition.id,
    size,
    sampleMembers: samples,
    missingDataNotes: collectMissingDataNotes(members, definition),
    refreshedAt: now.toISOString(),
  };
}

/** Warm trance / festival-fan segment used in the founder demo narrative. */
export const WARM_TRANCE_SEGMENT: SegmentDefinition = Object.freeze({
  id: 'warm-trance-link-engaged',
  name: 'Warm Trance Fans',
  dimensions: Object.freeze([
    'genre_affinity',
    'link_activity',
    'recency',
  ] as const),
  genreTags: Object.freeze(['trance', 'progressive-trance', 'edm']),
  recencyDays: 45,
  minLinkClicks: 1,
});

export function isStableSegmentDefinition(
  a: SegmentDefinition,
  b: SegmentDefinition
): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.dimensions.join(',') === b.dimensions.join(',') &&
    (a.genreTags ?? []).join(',') === (b.genreTags ?? []).join(',') &&
    a.recencyDays === b.recencyDays &&
    a.requireBuyer === b.requireBuyer &&
    a.requireSubscriber === b.requireSubscriber &&
    a.minLinkClicks === b.minLinkClicks
  );
}
