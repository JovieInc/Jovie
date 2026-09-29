import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { ScheduledReleasePage } from './ScheduledReleasePage';

const meta = {
  title: 'Features/Release/ScheduledReleasePage',
  component: ScheduledReleasePage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    release: {
      slug: 'the-deep-end',
      title: 'The Deep End',
      artworkUrl: getMarketingExportImage('tim-white-profile-live-mobile')
        .publicUrl,
      releaseDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
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

export const Default: Story = {};
