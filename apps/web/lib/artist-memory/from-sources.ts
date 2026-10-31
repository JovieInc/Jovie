/**
 * Adapters that project today's scattered artist data onto the artist memory
 * contract, so the "What Jovie knows" surface and generated views can read one
 * shape before any data is migrated.
 *
 * Sources today:
 * - creator_profiles columns the artist typed in settings (bio, career
 *   highlights, genres, location, active-since year);
 * - Memory Core v0 observations (`memory_observations`) learned from chat and
 *   connectors.
 *
 * Pure: callers load rows and pass `now`.
 */
import {
  ARTIST_MEMORY_CONTRACT,
  type ArtistMemoryFact,
  type MemoryFactKind,
  type MemoryReviewState,
  type MemoryVisibility,
} from './contract';

export interface ProfileMemorySource {
  readonly id: string;
  readonly bio: string | null;
  readonly careerHighlights: string | null;
  readonly genres: readonly string[] | null;
  readonly location: string | null;
  readonly activeSinceYear: number | null;
  readonly updatedAt: string;
}

interface ProfileField {
  readonly key: string;
  readonly kind: MemoryFactKind;
  readonly label: string;
  /** Where the field already renders today; settings-typed values keep that reach. */
  readonly visibility: MemoryVisibility;
  readonly read: (
    p: ProfileMemorySource
  ) => { value: unknown; display: string } | null;
}

const text = (v: string | null) => {
  const trimmed = v?.trim() ?? '';
  return trimmed ? { value: trimmed, display: trimmed } : null;
};

const PROFILE_FIELDS: readonly ProfileField[] = [
  {
    key: 'artist.bio',
    kind: 'bio',
    label: 'Bio',
    visibility: 'public',
    read: p => text(p.bio),
  },
  {
    // Used for pitches and the public profile mapper today.
    key: 'artist.career_highlights',
    kind: 'career',
    label: 'Career highlights',
    visibility: 'agents',
    read: p => text(p.careerHighlights),
  },
  {
    key: 'artist.genres',
    kind: 'identity',
    label: 'Genres',
    visibility: 'public',
    read: p => {
      const genres = (p.genres ?? []).map(g => g.trim()).filter(Boolean);
      return genres.length
        ? { value: genres, display: genres.join(', ') }
        : null;
    },
  },
  {
    key: 'artist.location',
    kind: 'identity',
    label: 'Based in',
    visibility: 'public',
    read: p => text(p.location),
  },
  {
    key: 'artist.active_since',
    kind: 'career',
    label: 'Active since',
    visibility: 'public',
    read: p =>
      p.activeSinceYear
        ? { value: p.activeSinceYear, display: String(p.activeSinceYear) }
        : null,
  },
];

/** Artist-typed profile fields become confirmed facts with the artist as source. */
export function profileToMemoryFacts(
  profile: ProfileMemorySource
): ArtistMemoryFact[] {
  const facts: ArtistMemoryFact[] = [];
  for (const field of PROFILE_FIELDS) {
    const read = field.read(profile);
    if (!read) continue;
    facts.push({
      contract: ARTIST_MEMORY_CONTRACT,
      id: `profile:${profile.id}:${field.key}`,
      profileId: profile.id,
      key: field.key,
      kind: field.kind,
      label: field.label,
      value: read.value as ArtistMemoryFact['value'],
      display: read.display,
      provenance: [
        {
          sourceId: 'jovie.artist',
          method: 'settings_form',
          observedAt: profile.updatedAt,
        },
      ],
      confidence: 1,
      visibility: field.visibility,
      review: 'confirmed',
      origin: 'artist',
      updatedAt: profile.updatedAt,
    });
  }
  return facts;
}

export interface ObservationMemorySource {
  readonly id: string;
  readonly profileId: string;
  readonly fact: string;
  readonly status: 'proposed' | 'accepted' | 'rejected';
  /** Stored as text in memory_observations; parsed defensively. */
  readonly confidence: string | null;
  readonly sourceType: string | null;
  readonly sourceRecordId: string | null;
  readonly createdAt: string;
}

const OBSERVATION_REVIEW: Record<
  ObservationMemorySource['status'],
  MemoryReviewState
> = {
  proposed: 'found',
  accepted: 'confirmed',
  rejected: 'rejected',
};

function parseConfidence(raw: string | null): number | null {
  if (raw === null) return null;
  const named: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
  if (raw in named) return named[raw] ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

/**
 * Learned observations are private until the artist confirms them; they never
 * leave the owner view while unconfirmed (see projectArtistMemory).
 */
export function observationToMemoryFact(
  obs: ObservationMemorySource
): ArtistMemoryFact {
  const fromChat = obs.sourceType === 'chat_message';
  const display = obs.fact.trim().slice(0, 2000);
  return {
    contract: ARTIST_MEMORY_CONTRACT,
    id: `observation:${obs.id}`,
    profileId: obs.profileId,
    key: `artist.learned.${
      obs.id
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .slice(0, 32) || 'fact'
    }`,
    kind: 'learned',
    label: fromChat
      ? 'Learned in conversation'
      : 'Learned from a connected source',
    value: display,
    display,
    provenance: [
      {
        sourceId: fromChat
          ? 'jovie.chat'
          : `memory.${obs.sourceType ?? 'unknown'}`,
        method: 'observation',
        observedAt: obs.createdAt,
        sourceRef: obs.sourceRecordId
          ? { kind: 'memory_source_record', id: obs.sourceRecordId }
          : null,
      },
    ],
    confidence: parseConfidence(obs.confidence),
    visibility: 'private',
    review: OBSERVATION_REVIEW[obs.status],
    origin: fromChat ? 'conversation' : 'connector',
    updatedAt: obs.createdAt,
  };
}
