'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type ArtistRole,
  artists,
  releaseArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';

type SmartLinkCreditRole = Exclude<ArtistRole, 'vs' | 'with'>;

const CREDIT_ROLE_ORDER: SmartLinkCreditRole[] = [
  'main_artist',
  'featured_artist',
  'producer',
  'co_producer',
  'composer',
  'lyricist',
  'arranger',
  'conductor',
  'remixer',
  'mix_engineer',
  'mastering_engineer',
  'other',
];

const CREDIT_ROLE_LABELS: Record<SmartLinkCreditRole, string> = {
  main_artist: 'Primary artist',
  featured_artist: 'Featured',
  producer: 'Producer',
  co_producer: 'Co-producer',
  composer: 'Composer',
  lyricist: 'Lyricist',
  arranger: 'Arranger',
  conductor: 'Conductor',
  remixer: 'Remixer',
  mix_engineer: 'Mix engineer',
  mastering_engineer: 'Mastering',
  other: 'Other',
};

interface CreditEntry {
  artistId: string;
  name: string;
  handle: string | null;
  role: string;
  position: number;
}

interface CreditGroup {
  role: string;
  label: string;
  entries: CreditEntry[];
}

export async function fetchReleaseCreditsAction(
  releaseId: string
): Promise<CreditGroup[]> {
  const rows = await db
    .select({
      artistId: artists.id,
      artistName: artists.name,
      creditName: releaseArtists.creditName,
      handle: creatorProfiles.usernameNormalized,
      role: releaseArtists.role,
      position: releaseArtists.position,
    })
    .from(releaseArtists)
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .leftJoin(creatorProfiles, eq(artists.creatorProfileId, creatorProfiles.id))
    .where(eq(releaseArtists.releaseId, releaseId))
    .orderBy(releaseArtists.position);

  const groups = new Map<SmartLinkCreditRole, CreditEntry[]>();

  for (const row of rows) {
    const name = (row.creditName ?? row.artistName).trim();
    if (!name) continue;

    const role: SmartLinkCreditRole =
      row.role === 'vs' || row.role === 'with' ? 'other' : row.role;

    const entries = groups.get(role) ?? [];
    entries.push({
      artistId: row.artistId,
      name,
      handle: row.handle,
      role,
      position: row.position,
    });
    groups.set(role, entries);
  }

  return Array.from(groups.entries())
    .sort(
      ([a], [b]) => CREDIT_ROLE_ORDER.indexOf(a) - CREDIT_ROLE_ORDER.indexOf(b)
    )
    .map(([role, entries]) => ({
      role,
      label: CREDIT_ROLE_LABELS[role],
      entries,
    }));
}
