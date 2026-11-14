import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { stubYouTubeEmbeds } from '@/.storybook/youtube-embed-stub';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { VideoReleasePage } from './VideoReleasePage';

const meta = {
  title: 'Features/Release/VideoReleasePage',
  component: VideoReleasePage,
  parameters: {
    layout: 'fullscreen',
  },
  // Stories never load YouTube: the embed gets a local placeholder document,
  // which also loads in time, so the embed-failure redirect never fires.
  beforeEach: () => stubYouTubeEmbeds(),
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
    videoId: 'dQw4w9WgXcQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
} satisfies Meta<typeof VideoReleasePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No artwork yet: the hero shows the AudioLines fallback above the embed. */
export const EmptyArtwork: Story = {
  args: {
    release: {
      title: 'The Deep End (Official Video)',
      slug: 'the-deep-end',
      artworkUrl: null,
    },
  },
};

/** A long title and artist wrap below the art. */
export const LongContentTitle: Story = {
  args: {
    release: {
      title:
        'The Deep End (Official Video) [Extended Directors Cut featuring The Midnight Strings Orchestra]',
      slug: 'the-deep-end',
      artworkUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
};

/** The video page inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    release: {
      title: 'النهاية العميقة',
      slug: 'the-deep-end',
      artworkUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
