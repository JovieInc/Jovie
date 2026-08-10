import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK,
} from '@/components/features/home/homepage-profile-preview-fixture';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
} from '../marketing/storybook/marketingStoryMeta';
import {
  PlaylistDetailContent,
  type PlaylistDetailData,
  type PlaylistDetailTrack,
} from './PlaylistDetailContent';

/**
 * The deterministic playlist identity and release rows come from the checked-in
 * homepage profile fixture; they are not a claim about currently deployed
 * playlist data. The story deliberately omits external Spotify links rather
 * than fabricating IDs that are not present in that canonical fixture.
 */
export const PLAYLIST_DETAIL_STORY_PLAYLIST: PlaylistDetailData = {
  slug: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.playlistId.replace(
    /^playlist-/,
    ''
  ),
  title: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.title,
  coverImageUrl: HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK.imageUrl,
  description: null,
  shareDescription: null,
  spotifyPlaylistId: null,
};

export const PLAYLIST_DETAIL_STORY_TRACKS: readonly PlaylistDetailTrack[] =
  HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES.slice(1, 4).map(
    (release, index) => ({
      id: release.id,
      position: index + 1,
      trackName: release.title,
      artistName: release.artistNames.join(' & '),
      spotifyTrackId: null,
      username:
        release.artistNames.length === 1 &&
        release.artistNames[0] === TIM_WHITE_PROFILE.name
          ? TIM_WHITE_PROFILE.publicProfileHandle
          : null,
    })
  );

const meta = {
  title: 'Marketing/Routes/PlaylistDetail',
  component: PlaylistDetailContent,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Exact shared production body for web-010-playlists--[slug], rendered with a deterministic fixture rather than deployed playlist data. Route params, database reads, cache policy, notFound handling, metadata, and JSON-LD remain route-owned. Fixture identity comes from the checked-in Tim White homepage profile fixture; unavailable Spotify IDs are represented honestly as null.`,
      },
    },
    pen: {
      registryId: 'web-010-playlists--[slug]',
      route: '/playlists/[slug]',
      source: 'apps/web/components/organisms/PlaylistDetailContent.tsx',
      sourceSha: 'e21d2e01bc80d7e0146a071207c406e1cd762bd3',
      fixture:
        'apps/web/components/features/home/homepage-profile-preview-fixture.ts',
    },
  },
  tags: ['autodocs'],
  args: {
    playlist: PLAYLIST_DETAIL_STORY_PLAYLIST,
    tracks: PLAYLIST_DETAIL_STORY_TRACKS,
  },
} satisfies Meta<typeof PlaylistDetailContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web010PlaylistDetail: Story = {
  name: 'web-010 /playlists/[slug]',
};
