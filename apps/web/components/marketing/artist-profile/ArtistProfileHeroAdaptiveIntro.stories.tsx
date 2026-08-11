import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';

const meta = {
  title: 'Marketing/Source/ArtistProfileHeroAdaptiveIntro',
  component: ArtistProfileHeroAdaptiveIntro,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Exact source-backed ArtistProfileHeroAdaptiveIntro body: the /artist-profiles hero plus the inline trust strip and the mounted adaptive section.',
      },
    },
  },
  args: {
    hero: ARTIST_PROFILE_COPY.hero,
    adaptive: ARTIST_PROFILE_COPY.adaptive,
  },
} satisfies Meta<typeof ArtistProfileHeroAdaptiveIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Intro: Story = {};
