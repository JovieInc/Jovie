import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileOutcomesCarousel } from './ArtistProfileOutcomesCarousel';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileOutcomesCarousel',
  component: ArtistProfileOutcomesCarousel,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    outcomes: ARTIST_PROFILE_COPY.outcomes,
  },
} satisfies Meta<typeof ArtistProfileOutcomesCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OutcomesCarousel: Story = {};
