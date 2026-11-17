import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { ScheduledReleasePage } from './ScheduledReleasePage';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rendered states of the scheduled release page. The default page lives in
 * ScheduledReleasePage.stories.tsx.
 */
const meta = {
  title: 'Features/Release/ScheduledReleasePage/States',
  component: ScheduledReleasePage,
  parameters: { layout: 'fullscreen' },
  args: {
    release: {
      slug: 'the-deep-end',
      title: 'The Deep End',
      artworkUrl: getMarketingExportImage('tim-white-profile-live-mobile')
        .publicUrl,
      releaseDate: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    },
    artist: {
      id: 'artist-1',
      name: TIM_WHITE_PROFILE.name,
      handle: TIM_WHITE_PROFILE.handle,
      avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
} satisfies Meta<typeof ScheduledReleasePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long title and artist name over the countdown panel. */
export const LongContentTitle: Story = {
  args: {
    release: {
      slug: 'extended-deluxe',
      title:
        'An Extended Deluxe Edition With A Very Long Release Title That Keeps Going',
      artworkUrl: null,
      releaseDate: new Date(Date.now() + 3 * DAY_MS).toISOString(),
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
      releaseDate: new Date(Date.now() + 3 * DAY_MS).toISOString(),
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
