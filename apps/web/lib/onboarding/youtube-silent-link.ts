import 'server-only';

import { and, sql as drizzleSql, eq, isNull, max } from 'drizzle-orm';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { discogReleases, discogTracks } from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  listRecentPublicVideos,
  resolveYouTubeChannel,
  searchYouTubeChannels,
} from '@/lib/youtube/resolve-channel';
import {
  runSilentYouTubeLink,
  type SilentLinkDeps,
  type SilentLinkResult,
} from './youtube-silent-link-core';

const SEARCH_LIMIT = 5;

const productionDeps: SilentLinkDeps = {
  now: () => new Date(),
  async loadProfile(profileId) {
    const [row] = await db
      .select({
        displayName: creatorProfiles.displayName,
        usernameNormalized: creatorProfiles.usernameNormalized,
        settings: creatorProfiles.settings,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);
    return row ?? null;
  },
  async hasYouTubeLinkRow(profileId) {
    const rows = await db
      .select({ id: socialLinks.id })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.platform, 'youtube')
        )
      )
      .limit(1);
    return rows.length > 0;
  },
  async loadCatalogTitles(profileId) {
    const [releases, tracks] = await Promise.all([
      db
        .select({ title: discogReleases.title })
        .from(discogReleases)
        .where(
          and(
            eq(discogReleases.creatorProfileId, profileId),
            isNull(discogReleases.deletedAt)
          )
        )
        .limit(300),
      db
        .select({ title: discogTracks.title })
        .from(discogTracks)
        .where(eq(discogTracks.creatorProfileId, profileId))
        .limit(500),
    ]);
    return [...new Set([...releases, ...tracks].map(row => row.title))];
  },
  searchChannels: query => searchYouTubeChannels(query, SEARCH_LIMIT),
  async loadEvidence(channelId, fallbackTitle) {
    const channel = await resolveYouTubeChannel({
      kind: 'id',
      value: channelId,
    });
    if (!channel) return null;
    const videos = await listRecentPublicVideos(channel.uploadsPlaylistId, 12);
    return {
      channelId: channel.channelId,
      title: channel.title || fallbackTitle,
      videoTitles: videos.map(video => video.title),
      handle: channel.handle,
    };
  },
  async insertLink({ profileId, usernameNormalized, url, title, match }) {
    // Best-effort single writer: the 24h throttle plus this re-check keep
    // duplicates out; a transaction would need an RLS actor for no real gain.
    const inserted = await (async () => {
      const existing = await db
        .select({ id: socialLinks.id })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, profileId),
            eq(socialLinks.platform, 'youtube')
          )
        )
        .limit(1);
      if (existing.length > 0) return false;
      const [order] = await db
        .select({ maxOrder: max(socialLinks.sortOrder) })
        .from(socialLinks)
        .where(eq(socialLinks.creatorProfileId, profileId));
      await db.insert(socialLinks).values({
        creatorProfileId: profileId,
        platform: 'youtube',
        platformType: 'social',
        url,
        displayText: title,
        sortOrder: (order?.maxOrder ?? -1) + 1,
        isActive: true,
        state: 'active',
        confidence: '0.90',
        sourcePlatform: 'youtube_catalog_match',
        sourceType: 'ingested',
        // Ownership is NOT proven here; verificationStatus stays unverified.
        evidence: {
          sources: ['dsp_catalog'],
          signals: [...match.signals],
        },
      });
      return true;
    })();
    if (inserted) await invalidateProfileCache(usernameNormalized);
  },
  async markChecked(profileId, at) {
    await db
      .update(creatorProfiles)
      .set({
        settings: drizzleSql`jsonb_set(coalesce(${creatorProfiles.settings}, '{}'::jsonb), '{onboarding}', coalesce(${creatorProfiles.settings}->'onboarding', '{}'::jsonb) || jsonb_build_object('youtubeDiscoveryAt', ${at.toISOString()}::text))`,
      })
      .where(eq(creatorProfiles.id, profileId));
  },
};

/** Fail-soft entry point: never throws into a request. */
export async function silentlyLinkYouTubeChannel(
  profileId: string
): Promise<SilentLinkResult> {
  try {
    return await runSilentYouTubeLink(productionDeps, profileId);
  } catch (error) {
    void captureError('Silent YouTube link failed', error);
    return { status: 'skipped', reason: 'provider_unavailable' };
  }
}
