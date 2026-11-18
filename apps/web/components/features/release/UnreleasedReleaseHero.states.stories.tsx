import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { UnreleasedReleaseHero } from './UnreleasedReleaseHero';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rendered states of the unreleased release hero. The default hero lives in
 * UnreleasedReleaseHero.stories.tsx.
 */
const meta = {
  title: 'Features/Release/UnreleasedReleaseHero/States',
  component: UnreleasedReleaseHero,
  parameters: { layout: 'fullscreen' },
  args: {
    release: {
      slug: 'the-deep-end',
      title: 'The Deep End',
      artworkUrl: getMarketingExportImage('tim-white-profile-live-mobile')
        .publicUrl,
      releaseDate: new Date(Date.now() + 7 * DAY_MS),
    },
    artist: {
      id: 'artist-1',
      name: TIM_WHITE_PROFILE.name,
      handle: TIM_WHITE_PROFILE.handle,
      avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
} satisfies Meta<typeof UnreleasedReleaseHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a release title and artist name that wrap under the art. */
export const LongContentTitle: Story = {
  args: {
    release: {
      slug: 'extended-deluxe',
      title:
        'An Extended Deluxe Edition With A Very Long Release Title That Keeps Going',
      artworkUrl: null,
      releaseDate: new Date(Date.now() + 7 * DAY_MS),
    },
    artist: {
      id: 'artist-2',
      name: 'An Artist With An Exceptionally Long Stage Name',
      handle: 'long-name-artist',
      avatarUrl: null,
    },
  },
};

/** Right-to-left: an Arabic release title and artist in an RTL document. */
export const RtlArabicRelease: Story = {
  args: {
    release: {
      slug: 'la-taqul',
      title: 'لا تقل كلمة',
      artworkUrl: null,
      releaseDate: new Date(Date.now() + 7 * DAY_MS),
    },
    artist: {
      id: 'artist-3',
      name: 'ليلى أحمد',
      handle: 'layla',
      avatarUrl: null,
    },
  },
  decorators: [
    function RtlDocument(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
