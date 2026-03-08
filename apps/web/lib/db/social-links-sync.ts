import { and, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const MUSIC_PLATFORM_ALIASES = {
  spotify: ['spotify'],
  appleMusic: ['apple_music', 'apple-music'],
  youtube: ['youtube_music', 'youtube-music', 'youtube'],
} as const;

type MusicField = keyof typeof MUSIC_PLATFORM_ALIASES;

type MusicUrls = {
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
};

const MUSIC_FIELD_TO_LINK_KEY: Record<keyof MusicUrls, MusicField> = {
  spotifyUrl: 'spotify',
  appleMusicUrl: 'appleMusic',
  youtubeUrl: 'youtube',
};

function hasQueryMethods(tx: DbOrTransaction): tx is DbOrTransaction {
  return (
    typeof (tx as { select?: unknown }).select === 'function' &&
    typeof (tx as { update?: unknown }).update === 'function' &&
    typeof (tx as { insert?: unknown }).insert === 'function'
  );
}

const toMusicUrl = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function syncPrimaryMusicUrlsFromSocialLinks(
  tx: DbOrTransaction,
  profileId: string
): Promise<void> {
  if (!hasQueryMethods(tx)) return;
  const rows = await tx
    .select({
      platform: socialLinks.platform,
      url: socialLinks.url,
      sortOrder: socialLinks.sortOrder,
    })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.isActive, true),
        eq(socialLinks.state, 'active'),
        inArray(socialLinks.platform, [
          ...MUSIC_PLATFORM_ALIASES.spotify,
          ...MUSIC_PLATFORM_ALIASES.appleMusic,
          ...MUSIC_PLATFORM_ALIASES.youtube,
        ])
      )
    )
    .orderBy(socialLinks.sortOrder, socialLinks.updatedAt);

  const resolveByAlias = (aliases: readonly string[]) =>
    rows.find(row => aliases.includes(row.platform))?.url ?? null;

  await tx
    .update(creatorProfiles)
    .set({
      spotifyUrl: resolveByAlias(MUSIC_PLATFORM_ALIASES.spotify),
      appleMusicUrl: resolveByAlias(MUSIC_PLATFORM_ALIASES.appleMusic),
      youtubeUrl: resolveByAlias(MUSIC_PLATFORM_ALIASES.youtube),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId));
}

export async function syncSocialLinksFromPrimaryMusicUrls(
  tx: DbOrTransaction,
  profileId: string,
  updates: MusicUrls
): Promise<void> {
  if (!hasQueryMethods(tx)) return;
  const entries = Object.entries(updates).filter(
    ([, value]) => value !== undefined
  ) as Array<[keyof MusicUrls, string | null]>;

  if (entries.length === 0) return;

  for (const [field, rawValue] of entries) {
    const aliases = MUSIC_PLATFORM_ALIASES[MUSIC_FIELD_TO_LINK_KEY[field]];
    const normalized = toMusicUrl(rawValue);

    if (!normalized) {
      await tx
        .update(socialLinks)
        .set({
          state: 'rejected',
          isActive: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialLinks.creatorProfileId, profileId),
            inArray(socialLinks.platform, [...aliases])
          )
        );
      continue;
    }

    const [existing] = await tx
      .select({ id: socialLinks.id })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          inArray(socialLinks.platform, [...aliases])
        )
      )
      .orderBy(
        drizzleSql`${socialLinks.state} = 'active' DESC`,
        socialLinks.updatedAt
      )
      .limit(1);

    if (existing) {
      await tx
        .update(socialLinks)
        .set({
          url: normalized,
          platform: aliases[0],
          platformType: 'dsp',
          state: 'active',
          isActive: true,
          sourceType: 'manual',
          updatedAt: new Date(),
        })
        .where(eq(socialLinks.id, existing.id));
    } else {
      await tx.insert(socialLinks).values({
        creatorProfileId: profileId,
        platform: aliases[0],
        platformType: 'dsp',
        url: normalized,
        sortOrder: 0,
        isActive: true,
        state: 'active',
        confidence: '1.00',
        sourceType: 'manual',
        version: 1,
      });
    }
  }
}
