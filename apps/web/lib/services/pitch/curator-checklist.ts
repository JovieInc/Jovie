/**
 * Curator-first pitch checklist (IndieBandGuru 2026-07-24 + r/musicmarketing).
 * Blast emails die when these fields are missing. Grill one gap at a time
 * before generateReleasePitch drafts. Do not invent values.
 */

export const PITCH_CHECKLIST_FIELD_IDS = [
  'artist',
  'title',
  'genre',
  'whyTwoSentences',
  'listenLink',
  'releaseDate',
  'whyThisPlaylist',
] as const;

export type PitchChecklistFieldId = (typeof PITCH_CHECKLIST_FIELD_IDS)[number];

export interface PitchChecklistField {
  readonly id: PitchChecklistFieldId;
  readonly label: string;
  readonly recommendHint: string;
}

export const PITCH_CHECKLIST_FIELDS: readonly PitchChecklistField[] = [
  {
    id: 'artist',
    label: 'Artist name',
    recommendHint: 'Use the connected profile display name.',
  },
  {
    id: 'title',
    label: 'Release title',
    recommendHint: 'Use the selected release title.',
  },
  {
    id: 'genre',
    label: 'Genre',
    recommendHint: 'Use the release genre, then the artist genre list.',
  },
  {
    id: 'whyTwoSentences',
    label: '1–2 sentences on why this release exists',
    recommendHint:
      'Recommend a one-sentence human reason from the release story, not the bio.',
  },
  {
    id: 'listenLink',
    label: 'Spotify or private listen link',
    recommendHint:
      'Ask for the Spotify URL or private/unlisted stream. Never invent a URL.',
  },
  {
    id: 'releaseDate',
    label: 'Release date',
    recommendHint: 'Use the discography release date when present.',
  },
  {
    id: 'whyThisPlaylist',
    label: 'Why this playlist / destination',
    recommendHint:
      'Prefer target-playlist fit over follower count. Name the lane, not the vanity metric.',
  },
] as const;

export interface PitchChecklistItem {
  readonly id: PitchChecklistFieldId;
  readonly label: string;
  readonly status: 'known' | 'unknown';
  readonly value: string | null;
  readonly recommendHint: string;
}

export interface PitchChecklistStatus {
  readonly items: readonly PitchChecklistItem[];
  readonly firstMissing: PitchChecklistItem | null;
  readonly allResolved: boolean;
}

const LISTEN_LINK_PATTERN = /https?:\/\/\S+/i;
const WHY_PATTERN =
  /\b(why this (playlist|song|release)|for fans of|ffo|sounds like|belongs on)\b/i;

export interface PitchChecklistInput {
  readonly artistName: string | null | undefined;
  readonly title: string | null | undefined;
  readonly genres: readonly string[] | null | undefined;
  readonly releaseDate: Date | string | null | undefined;
  readonly targetPlaylists: readonly string[] | null | undefined;
  readonly whyText: string | null | undefined;
  readonly instructions: string | null | undefined;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function formatReleaseDate(
  releaseDate: Date | string | null | undefined
): string | null {
  if (!releaseDate) return null;
  if (releaseDate instanceof Date) {
    return Number.isNaN(releaseDate.getTime())
      ? null
      : (releaseDate.toISOString().split('T')[0] ?? null);
  }
  const trimmed = releaseDate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve known vs unknown curator fields. A field may be marked unknown
 * in instructions (`UNKNOWN: listenLink`) so drafting can proceed without
 * inventing the value.
 */
export function getPitchChecklistStatus(
  input: PitchChecklistInput
): PitchChecklistStatus {
  const instructions = input.instructions?.trim() ?? '';
  const explicitUnknown = new Set(
    PITCH_CHECKLIST_FIELD_IDS.filter(id =>
      new RegExp(`unknown:\\s*${id}\\b`, 'i').test(instructions)
    )
  );
  const listenLink = LISTEN_LINK_PATTERN.exec(instructions)?.[0] ?? null;
  const whyTwoSentences = firstNonEmpty(input.whyText)
    ? firstNonEmpty(input.whyText)
    : /\b(i wrote|it'?s about|why this (song|release)|the song is)\b/i.test(
          instructions
        )
      ? instructions
      : null;
  const whyThisPlaylist = input.targetPlaylists?.length
    ? input.targetPlaylists.join(', ')
    : WHY_PATTERN.test(instructions)
      ? instructions
      : null;

  const values: Record<PitchChecklistFieldId, string | null> = {
    artist: firstNonEmpty(input.artistName),
    title: firstNonEmpty(input.title),
    genre: input.genres?.length ? input.genres.join(', ') : null,
    whyTwoSentences,
    listenLink,
    releaseDate: formatReleaseDate(input.releaseDate),
    whyThisPlaylist,
  };

  const items = PITCH_CHECKLIST_FIELDS.map(field => {
    const known = values[field.id] !== null && !explicitUnknown.has(field.id);
    return {
      id: field.id,
      label: field.label,
      status: known ? ('known' as const) : ('unknown' as const),
      value: known ? values[field.id] : null,
      recommendHint: field.recommendHint,
    };
  });

  const firstMissing = items.find(item => item.status === 'unknown') ?? null;
  return {
    items,
    firstMissing,
    allResolved: firstMissing === null,
  };
}

export function formatPitchChecklistForPrompt(
  status: PitchChecklistStatus
): string {
  const lines = status.items.map(item =>
    item.status === 'known'
      ? `- ${item.label}: ${item.value}`
      : `- ${item.label}: UNKNOWN`
  );
  if (status.firstMissing) {
    lines.push(
      '',
      `Next missing field: ${status.firstMissing.label}. ${status.firstMissing.recommendHint}`
    );
  }
  return ['## Curator Checklist', ...lines].join('\n');
}

/** Chat / tool procedure. Grill one field, recommend an answer, then draft. */
export const PITCH_GRILL_PROCEDURE = `Do not call generateReleasePitch until the curator checklist is resolved or the artist explicitly marks a field unknown.

Required fields: artist, title, genre, 1–2 sentences on why the release exists, Spotify or private listen link, release date, why-this-playlist.

Grill: ask ONE missing field at a time. Recommend a concrete answer from known context. Wait for confirm or an explicit UNKNOWN before asking the next field.

Draft rules once resolved: readable in under 1 minute; start outreach 2–4 weeks pre-release when the date is known; target playlist fit over follower count; include FFO when a real comparison exists; no attachments; never open with "Dear Curator"; one ask only; never invent a listen URL, @handle, or private email.`;
