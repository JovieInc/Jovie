/**
 * Ranked YouTube moves for an artist's channel, tied to catalog reactivation:
 * every move sends viewers of legacy videos to the song's Jovie page.
 *
 * Pure and deterministic: no model, DB or network. The chat tool feeds it the
 * profile's channel link, the catalog, the OAuth state and (when the Data API
 * key is set) public channel data; the model only words the result.
 */

import { JOVIE_SMART_LINK_HOSTS } from '@/lib/youtube-library/link-inspect';

export interface ChannelPlanVideo {
  readonly videoId: string;
  readonly title: string;
  readonly viewCount: number | null;
  readonly description: string;
  readonly publishedAt: string | null;
}

export interface ChannelPlanChannel {
  readonly title: string;
  readonly subscriberCount: number | null;
  readonly videoCount: number | null;
  readonly description: string;
  readonly playlistCount: number | null;
  readonly lastUploadAt: string | null;
}

export interface ChannelPlanRelease {
  readonly title: string;
  readonly slug: string | null;
  readonly releaseDate: string | null;
}

export interface ChannelPlanInput {
  readonly channelUrl: string;
  readonly artistName: string;
  /** https://jov.ie/<username> */
  readonly profileUrl: string;
  readonly releases: readonly ChannelPlanRelease[];
  readonly connected: boolean;
  readonly connectUrl: string | null;
  /** Null when public data could not be read; the plan then uses the catalog. */
  readonly channel: ChannelPlanChannel | null;
  /** Most-viewed first. */
  readonly topVideos: readonly ChannelPlanVideo[];
  readonly now: Date;
}

export type ChannelMoveNeeds = 'nothing' | 'youtube_connect' | 'youtube_studio';

export interface ChannelMove {
  readonly rank: number;
  readonly id:
    | 'description_links'
    | 'shorts_from_legacy'
    | 'era_playlists'
    | 'pinned_comments'
    | 'channel_description';
  readonly title: string;
  readonly why: string;
  readonly examples: readonly string[];
  /** What Jovie does in this chat right now. */
  readonly jovieNow: string;
  /** What finishing it needs: nothing more, the one-tap connect, or Studio. */
  readonly needs: ChannelMoveNeeds;
}

export interface ChannelPlan {
  readonly channelUrl: string;
  readonly dataSource: 'youtube_data_api' | 'profile_and_catalog';
  readonly channel: ChannelPlanChannel | null;
  readonly moves: readonly ChannelMove[];
  readonly connect: {
    readonly connected: boolean;
    readonly url: string | null;
    readonly unlocks: readonly string[];
  };
}

const MAX_MOVES = 5;
const STALE_UPLOAD_DAYS = 120;
const DAY_MS = 86_400_000;

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /\((?:official|lyric|audio|visualizer|music)[^)]*\)|\[[^\]]*\]/g,
      ' '
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchRelease(
  videoTitle: string,
  releases: readonly ChannelPlanRelease[]
): ChannelPlanRelease | null {
  const video = ` ${normalizeTitle(videoTitle)} `;
  let best: ChannelPlanRelease | null = null;
  for (const release of releases) {
    const title = normalizeTitle(release.title);
    if (title.length < 3 || !video.includes(` ${title} `)) continue;
    if (!best || title.length > normalizeTitle(best.title).length) {
      best = release;
    }
  }
  return best;
}

export function hasJovieLink(description: string): boolean {
  const lower = description.toLowerCase();
  return JOVIE_SMART_LINK_HOSTS.some(host => lower.includes(`${host}/`));
}

function releaseUrl(
  profileUrl: string,
  release: ChannelPlanRelease | null
): string {
  return release?.slug ? `${profileUrl}/${release.slug}` : profileUrl;
}

function formatViews(views: number | null): string {
  if (views === null) return '';
  if (views >= 1_000_000) return ` (${(views / 1_000_000).toFixed(1)}M views)`;
  if (views >= 1_000) return ` (${Math.round(views / 1_000)}K views)`;
  return ` (${views} views)`;
}

function newestFirst(
  releases: readonly ChannelPlanRelease[]
): ChannelPlanRelease[] {
  return [...releases].sort((a, b) =>
    (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')
  );
}

function descriptionLinksMove(input: ChannelPlanInput): ChannelMove | null {
  if (input.channel) {
    const missing = input.topVideos.filter(v => !hasJovieLink(v.description));
    if (missing.length === 0) return null;
    return {
      rank: 0,
      id: 'description_links',
      title: `Put the song's Jovie link on line 1 of your ${missing.length} most-viewed video${missing.length === 1 ? '' : 's'} that lack one`,
      why: 'Your top videos already get the traffic; today those viewers have no path to the song, your other releases or your fan list.',
      examples: missing.slice(0, 3).map(video => {
        const release = matchRelease(video.title, input.releases);
        return `${video.title}${formatViews(video.viewCount)} -> ${releaseUrl(input.profileUrl, release)}`;
      }),
      jovieNow: 'Drafts the exact first line for each video.',
      needs: 'youtube_connect',
    };
  }
  const recent = newestFirst(input.releases).slice(0, 3);
  return {
    rank: 0,
    id: 'description_links',
    title:
      "Put each song's Jovie link on line 1 of your 10 most-viewed video descriptions",
    why: 'Legacy videos are where catalog listeners already are; a first-line link turns each view into a path to the song and your profile.',
    examples: recent.map(
      release => `${release.title} -> ${releaseUrl(input.profileUrl, release)}`
    ),
    jovieNow:
      'Drafts the first line for each song; with YouTube connected it reads your real top 10 and applies them.',
    needs: 'youtube_connect',
  };
}

function shortsMove(input: ChannelPlanInput): ChannelMove | null {
  const last = input.channel?.lastUploadAt
    ? Date.parse(input.channel.lastUploadAt)
    : Number.NaN;
  if (Number.isNaN(last)) return null;
  const days = Math.floor((input.now.getTime() - last) / DAY_MS);
  if (days < STALE_UPLOAD_DAYS) return null;
  const top = input.topVideos.slice(0, 3);
  if (top.length === 0) return null;
  return {
    rank: 0,
    id: 'shorts_from_legacy',
    title: `Cut one Short from each of your top ${top.length} videos (last upload was ${days} days ago)`,
    why: 'Shorts are the cheapest way to wake a quiet channel, and each one can point at a song that already proved itself.',
    examples: top.map(video => video.title),
    jovieNow: 'Writes the hook line and caption for each Short.',
    needs: 'nothing',
  };
}

function eraPlaylistsMove(input: ChannelPlanInput): ChannelMove | null {
  const byYear = new Map<string, number>();
  for (const release of input.releases) {
    const year = release.releaseDate?.slice(0, 4);
    if (year) byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  const eras = [...byYear.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([a], [b]) => b.localeCompare(a));
  if (eras.length < 2) return null;
  const playlists = input.channel?.playlistCount ?? null;
  if (playlists !== null && playlists >= eras.length) return null;
  return {
    rank: 0,
    id: 'era_playlists',
    title: `Group the catalog into ${eras.length} era playlists, newest era first`,
    why: `${input.releases.length} releases with no era structure means one view rarely leads to the next song; playlists chain them into session time.`,
    examples: eras
      .slice(0, 3)
      .map(
        ([year, count]) => `${input.artistName}: ${year} (${count} releases)`
      ),
    jovieNow: 'Builds the playlist list and order from your catalog.',
    needs: 'youtube_connect',
  };
}

function pinnedCommentsMove(input: ChannelPlanInput): ChannelMove {
  const targets =
    input.topVideos.length > 0
      ? input.topVideos.slice(0, 3).map(video => {
          const release = matchRelease(video.title, input.releases);
          return `${video.title}: "Stream it everywhere: ${releaseUrl(input.profileUrl, release)}"`;
        })
      : newestFirst(input.releases)
          .slice(0, 3)
          .map(
            release =>
              `${release.title}: "Stream it everywhere: ${releaseUrl(input.profileUrl, release)}"`
          );
  return {
    rank: 0,
    id: 'pinned_comments',
    title: 'Pin a comment with the song link on each top video',
    why: 'Pinned comments sit above the fold on mobile, where most catalog views happen.',
    examples: targets,
    jovieNow: 'Writes each pinned comment now.',
    needs: 'youtube_studio',
  };
}

function channelDescriptionMove(input: ChannelPlanInput): ChannelMove | null {
  if (!input.channel || hasJovieLink(input.channel.description)) return null;
  return {
    rank: 0,
    id: 'channel_description',
    title: 'Add your Jovie profile to the channel description and header links',
    why: 'The channel page is where a new viewer decides to follow; it should lead to every release.',
    examples: [`${input.profileUrl}`],
    jovieNow: 'Drafts the channel description.',
    needs: 'youtube_connect',
  };
}

export function buildChannelPlan(input: ChannelPlanInput): ChannelPlan {
  const candidates = [
    descriptionLinksMove(input),
    shortsMove(input),
    eraPlaylistsMove(input),
    pinnedCommentsMove(input),
    channelDescriptionMove(input),
  ].filter((move): move is ChannelMove => move !== null);
  const moves = candidates
    .slice(0, MAX_MOVES)
    .map((move, index) => ({ ...move, rank: index + 1 }));
  return {
    channelUrl: input.channelUrl,
    dataSource: input.channel ? 'youtube_data_api' : 'profile_and_catalog',
    channel: input.channel,
    moves,
    connect: {
      connected: input.connected,
      url: input.connected ? null : input.connectUrl,
      unlocks: input.connected
        ? []
        : [
            'apply the description links in one step',
            'create the era playlists',
            'read watch time to re-rank this plan',
          ],
    },
  };
}
