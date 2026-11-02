import 'server-only';

import { tool } from 'ai';
import { eq } from 'drizzle-orm';
import { getAppUrl, getProfileUrl } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { findProfileLink } from '@/lib/chat/artist-links';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import type { ArtistContext, ReleaseContext } from '@/lib/chat/types';
import { getConnectorAvailability } from '@/lib/connectors/availability.server';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { logger } from '@/lib/utils/logger';
import { fetchChannelAuditData } from '@/lib/youtube/channel-audit-data';
import { buildChannelPlan } from '@/lib/youtube/channel-plan';

/** One-tap connect that returns the artist to chat. */
export function youtubeConnectUrl(profileId: string): string {
  const params = new URLSearchParams({
    creatorProfileId: profileId,
    returnTo: APP_ROUTES.CHAT,
  });
  return getAppUrl(`/api/connectors/youtube/authorize?${params.toString()}`);
}

async function loadReleaseSlugs(
  profileId: string
): Promise<Map<string, string>> {
  try {
    const rows = await db
      .select({ id: discogReleases.id, slug: discogReleases.slug })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, profileId));
    return new Map(rows.map(row => [row.id, row.slug]));
  } catch (error) {
    logger.warn('Release slugs unavailable for YouTube plan', {
      profileId,
      error,
    });
    return new Map();
  }
}

export function createAuditYouTubeChannelTool(input: {
  readonly profileId: string | null;
  readonly artistContext: ArtistContext;
  readonly releases: readonly ReleaseContext[];
}) {
  const schema = TOOL_SCHEMAS.auditYouTubeChannel;
  return tool({
    description: schema.description,
    inputSchema: schema.inputSchema,
    execute: async ({ channelUrl }) => {
      const links = input.artistContext.linksContext;
      const profileChannel = links
        ? findProfileLink(links.links, 'youtube')
        : null;
      const url = channelUrl?.trim() || profileChannel?.url || null;
      if (!url) {
        return {
          success: false as const,
          reason: 'no_channel_on_profile',
          nextStep:
            'Offer to add their channel with proposeSocialLink; ask only for the handle.',
        };
      }
      const connected = links?.connectedAccounts.includes('youtube') ?? false;
      const canConnect =
        Boolean(input.profileId) &&
        getConnectorAvailability().youtube?.available === true;
      const [data, slugs] = await Promise.all([
        fetchChannelAuditData(url),
        input.profileId
          ? loadReleaseSlugs(input.profileId)
          : Promise.resolve(new Map<string, string>()),
      ]);
      const plan = buildChannelPlan({
        channelUrl: url,
        artistName: input.artistContext.displayName,
        profileUrl: getProfileUrl(input.artistContext.username),
        releases: input.releases.map(release => ({
          title: release.title,
          slug: slugs.get(release.id) ?? null,
          releaseDate: release.releaseDate,
        })),
        connected,
        connectUrl:
          canConnect && input.profileId
            ? youtubeConnectUrl(input.profileId)
            : null,
        channel: data.ok ? data.channel : null,
        topVideos: data.ok ? data.topVideos : [],
        now: new Date(),
      });
      return {
        success: true as const,
        ...plan,
        ...(data.ok ? {} : { publicDataReason: data.reason }),
        instructions:
          'Lead with the channel and subscriber count when present. Give the moves in rank order, each in one line with its first example. Say what you can do right now, then put the connect link as a markdown link if connect.url is set. Never ask for the channel URL.',
      };
    },
  });
}
