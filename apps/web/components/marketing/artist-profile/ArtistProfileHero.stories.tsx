import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileHero } from './ArtistProfileHero';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileHero',
  component: ArtistProfileHero,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    hero: ARTIST_PROFILE_COPY.hero,
    adaptive: ARTIST_PROFILE_COPY.adaptive,
  },
} satisfies Meta<typeof ArtistProfileHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = {};
