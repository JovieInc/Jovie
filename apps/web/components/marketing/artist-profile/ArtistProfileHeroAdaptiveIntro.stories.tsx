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
          'Exact source-backed ArtistProfileHeroAdaptiveIntro body: the /artist-profiles hero and the mounted adaptive section. The trust strip renders only once a brand grants permission for the page (JOV-7795).',
      },
    },
  },
  args: {
    hero: ARTIST_PROFILE_COPY.hero,
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    logoPlacement: { page: '/artist-profiles' },
  },
} satisfies Meta<typeof ArtistProfileHeroAdaptiveIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Intro: Story = {};
