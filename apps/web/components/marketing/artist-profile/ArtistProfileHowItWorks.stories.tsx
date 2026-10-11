import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileHowItWorks',
  component: ArtistProfileHowItWorks,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    howItWorks: ARTIST_PROFILE_COPY.howItWorks,
  },
} satisfies Meta<typeof ArtistProfileHowItWorks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HowItWorks: Story = {};
