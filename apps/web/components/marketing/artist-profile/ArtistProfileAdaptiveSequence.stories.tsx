import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileAdaptiveSequence } from './ArtistProfileAdaptiveSequence';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileAdaptiveSequence',
  component: ArtistProfileAdaptiveSequence,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: ARTIST_PROFILE_COPY.hero.phoneCaption,
    phoneSubcaption: ARTIST_PROFILE_COPY.hero.phoneSubcaption,
  },
} satisfies Meta<typeof ArtistProfileAdaptiveSequence>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdaptiveSequence: Story = {};
