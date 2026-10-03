import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { UnreleasedReleaseHero } from './UnreleasedReleaseHero';

const meta = {
  title: 'Features/Release/UnreleasedReleaseHero',
  component: UnreleasedReleaseHero,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    release: {
      slug: 'the-deep-end',
      title: 'The Deep End',
      artworkUrl: getMarketingExportImage('tim-white-profile-live-mobile')
        .publicUrl,
      releaseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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

export const Default: Story = {};
