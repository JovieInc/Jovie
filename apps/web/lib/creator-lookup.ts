import 'server-only';

import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  parseYouTubeChannelInput,
  resolveYouTubeChannel,
  type YouTubeChannelRef,
  type YouTubeResolvedChannel,
} from '@/lib/youtube/resolve-channel';

const YOUTUBE_LOOKUP_PREFIX = /^youtube:(.+)$/i;
const YOUTUBE_URL_PREFIX = /^(?:https?:\/\/)?(?:(?:www|m)\.)?youtube\.com\//i;

export interface CreatorLookupProfile {
  readonly username: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  readonly avatarUrl: string | null;
  readonly spotifyUrl: string | null;
  readonly appleMusicUrl: string | null;
}

export type CreatorLookupOutcome =
  | { readonly kind: 'invalid_input' }
  | { readonly kind: 'channel_not_found' }
  | { readonly kind: 'ambiguous' }
  | {
      readonly kind: 'success';
      readonly channel: YouTubeResolvedChannel;
      readonly profile: CreatorLookupProfile | null;
    };

interface CreatorLookupDependencies {
  readonly resolveChannel?: (
    ref: YouTubeChannelRef
  ) => Promise<YouTubeResolvedChannel | null>;
  readonly findProfiles?: (
    channel: YouTubeResolvedChannel
  ) => Promise<readonly CreatorLookupProfile[]>;
}

/** Accept a YouTube channel URL or an explicit `youtube:<handle-or-id>` key. */
export function parseCreatorLookupInput(
  input: string
): YouTubeChannelRef | null {
  const value = input.trim();
  if (!value || value.length > 200) return null;

  const prefixed = value.match(YOUTUBE_LOOKUP_PREFIX);
  if (prefixed) {
    return parseYouTubeChannelInput(prefixed[1] ?? '');
  }

  if (!YOUTUBE_URL_PREFIX.test(value)) return null;
  return parseYouTubeChannelInput(value);
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function youtubeIdentityUrls(
  channel: YouTubeResolvedChannel
): readonly string[] {
  const channelPaths = [
    `/channel/${channel.channelId}`,
    `/channel/${channel.channelId}/`,
  ];
  const handlePaths = channel.handle
    ? [
        `/@${channel.handle}`,
        `/@${channel.handle}/`,
        `/c/${channel.handle}`,
        `/user/${channel.handle}`,
      ]
    : [];
  const origins = [
    'https://www.youtube.com',
    'https://youtube.com',
    'http://www.youtube.com',
    'http://youtube.com',
  ];

  return [
    channel.channelId,
    ...(channel.handle ? [channel.handle, `@${channel.handle}`] : []),
    ...origins.flatMap(origin =>
      [...channelPaths, ...handlePaths].map(path => `${origin}${path}`)
    ),
  ];
}

/** Match only a resolved platform identity; never guess from a Jovie username. */
export async function findPublicProfilesByYouTubeChannel(
  channel: YouTubeResolvedChannel
): Promise<readonly CreatorLookupProfile[]> {
  const urlConditions = youtubeIdentityUrls(channel).map(value =>
    ilike(creatorProfiles.youtubeUrl, escapeLikePattern(value))
  );

  return db
    .select({
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      location: creatorProfiles.location,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isPublic, true),
        or(
          eq(creatorProfiles.youtubeMusicId, channel.channelId),
          ...urlConditions
        )
      )
    )
    .limit(2);
}

export async function lookupCreator(
  input: string,
  dependencies: CreatorLookupDependencies = {}
): Promise<CreatorLookupOutcome> {
  const ref = parseCreatorLookupInput(input);
  if (!ref) return { kind: 'invalid_input' };

  const channel = await (dependencies.resolveChannel ?? resolveYouTubeChannel)(
    ref
  );
  if (!channel) return { kind: 'channel_not_found' };

  const profiles = await (
    dependencies.findProfiles ?? findPublicProfilesByYouTubeChannel
  )(channel);
  if (profiles.length > 1) return { kind: 'ambiguous' };

  return { kind: 'success', channel, profile: profiles[0] ?? null };
}
