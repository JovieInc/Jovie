import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { VideoReleasePage } from './VideoReleasePage';

const meta = {
  title: 'Features/Release/VideoReleasePage',
  component: VideoReleasePage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    release: {
      title: 'The Deep End (Official Video)',
      slug: 'the-deep-end',
      artworkUrl: getMarketingExportImage('tim-white-profile-live-mobile')
        .publicUrl,
    },
    artist: {
      id: 'artist-1',
      name: TIM_WHITE_PROFILE.name,
      handle: TIM_WHITE_PROFILE.handle,
      avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
      ownerUserId: 'user-1',
      spotifyId: TIM_WHITE_PROFILE.spotifyArtistId,
    },
    // A stable, always-available public video id (youtube-nocookie embed).
    videoId: 'dQw4w9WgXcQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
} satisfies Meta<typeof VideoReleasePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
