import 'server-only';
import { and, asc, sql as drizzleSql, eq, inArray, or } from 'drizzle-orm';
import type {
  ArtistSnapshotCandidate,
  ArtistSnapshotSourceName,
  ArtistSnapshotStore,
  StoredArtistSnapshot,
} from '@/lib/artist-snapshots/run';
import { db } from '@/lib/db';
import { artistDailySnapshots } from '@/lib/db/schema/artist-daily-snapshots';
import { artists } from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { validateInstagramUrl } from '@/lib/ingestion/strategies/instagram';
import { validateYouTubeChannelUrl } from '@/lib/ingestion/strategies/youtube';

const MUSICBRAINZ_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SNAPSHOT_SOURCES = new Set<ArtistSnapshotSourceName>([
  'youtube',
  'instagram',
  'wikipedia',
]);

function firstYouTubeChannel(urls: readonly (string | null)[]): string | null {
  for (const url of urls) {
    if (!url) continue;
    const channel = validateYouTubeChannelUrl(url);
    if (channel) return channel;
  }
  return null;
}

function firstInstagramProfile(urls: readonly string[]): string | null {
  for (const url of urls) {
    const profile = validateInstagramUrl(url);
    if (profile) return profile;
  }
  return null;
}

function firstMusicBrainzId(ids: readonly (string | null)[]): string | null {
  for (const id of ids) {
    if (id && MUSICBRAINZ_ID.test(id)) return id.toLowerCase();
  }
  return null;
}

export const drizzleArtistSnapshotStore: ArtistSnapshotStore = {
  async listCandidates(limit, day) {
    const lastSnapshotDay = drizzleSql<string | null>`(
      select max(${artistDailySnapshots.snapshotDay})
      from ${artistDailySnapshots}
      where ${artistDailySnapshots.creatorProfileId} = ${creatorProfiles.id}
    )`;
    const profiles = await db
      .select({
        id: creatorProfiles.id,
        youtubeUrl: creatorProfiles.youtubeUrl,
        musicbrainzId: creatorProfiles.musicbrainzId,
      })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.creatorType, 'artist'),
          or(
            drizzleSql`${creatorProfiles.youtubeUrl} is not null`,
            drizzleSql`${creatorProfiles.musicbrainzId} is not null`,
            drizzleSql`exists (
              select 1 from ${socialLinks}
              where ${socialLinks.creatorProfileId} = ${creatorProfiles.id}
                and ${socialLinks.platform} in ('instagram', 'youtube')
                and ${socialLinks.isActive} = true
                and ${socialLinks.state} = 'active'
            )`,
            drizzleSql`exists (
              select 1 from ${artists}
              where ${artists.creatorProfileId} = ${creatorProfiles.id}
                and ${artists.musicbrainzId} is not null
            )`
          )
        )
      )
      .orderBy(
        drizzleSql`${lastSnapshotDay} asc nulls first`,
        asc(creatorProfiles.id)
      )
      .limit(limit);
    if (profiles.length === 0) return [];
    const ids = profiles.map(profile => profile.id);
    const [links, linkedArtists, existing] = await Promise.all([
      db
        .select({
          creatorProfileId: socialLinks.creatorProfileId,
          platform: socialLinks.platform,
          url: socialLinks.url,
        })
        .from(socialLinks)
        .where(
          and(
            inArray(socialLinks.creatorProfileId, ids),
            inArray(socialLinks.platform, ['instagram', 'youtube']),
            eq(socialLinks.isActive, true),
            eq(socialLinks.state, 'active')
          )
        ),
      db
        .select({
          creatorProfileId: artists.creatorProfileId,
          musicbrainzId: artists.musicbrainzId,
        })
        .from(artists)
        .where(
          and(
            inArray(artists.creatorProfileId, ids),
            drizzleSql`${artists.musicbrainzId} is not null`
          )
        ),
      db
        .select({
          creatorProfileId: artistDailySnapshots.creatorProfileId,
          source: artistDailySnapshots.source,
        })
        .from(artistDailySnapshots)
        .where(
          and(
            inArray(artistDailySnapshots.creatorProfileId, ids),
            eq(artistDailySnapshots.snapshotDay, day)
          )
        ),
    ]);
    return profiles.flatMap((profile): ArtistSnapshotCandidate[] => {
      const profileLinks = links.filter(
        link => link.creatorProfileId === profile.id
      );
      const candidate: ArtistSnapshotCandidate = {
        creatorProfileId: profile.id,
        youtubeUrl: firstYouTubeChannel([
          ...profileLinks
            .filter(link => link.platform === 'youtube')
            .map(link => link.url),
          profile.youtubeUrl,
        ]),
        instagramUrl: firstInstagramProfile(
          profileLinks
            .filter(link => link.platform === 'instagram')
            .map(link => link.url)
        ),
        musicbrainzId: firstMusicBrainzId([
          profile.musicbrainzId,
          ...linkedArtists
            .filter(artist => artist.creatorProfileId === profile.id)
            .map(artist => artist.musicbrainzId),
        ]),
        existingSources: existing
          .filter(row => row.creatorProfileId === profile.id)
          .map(row => row.source)
          .filter((source): source is ArtistSnapshotSourceName =>
            SNAPSHOT_SOURCES.has(source as ArtistSnapshotSourceName)
          ),
      };
      if (
        !candidate.youtubeUrl &&
        !candidate.instagramUrl &&
        !candidate.musicbrainzId
      ) {
        return [];
      }
      return [candidate];
    });
  },
  async insert(row: StoredArtistSnapshot) {
    const inserted = await db
      .insert(artistDailySnapshots)
      .values({
        creatorProfileId: row.creatorProfileId,
        source: row.source,
        snapshotDay: row.snapshotDay,
        fetchedAt: row.fetchedAt,
        rawValues: row.rawValues,
        provenance: row.provenance,
      })
      .onConflictDoNothing()
      .returning({ id: artistDailySnapshots.id });
    return inserted.length > 0 ? 'inserted' : 'duplicate';
  },
};
