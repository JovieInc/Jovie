import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileAdaptiveSection } from './ArtistProfileAdaptiveSection';

const meta = {
  title: 'Marketing/Source/ArtistProfileAdaptiveSection',
  component: ArtistProfileAdaptiveSection,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Exact source-backed ArtistProfileAdaptiveSection body: the shipped /artist-profiles adaptive section (phone-framed mode switcher, phone-right variant). Mounted by the route via ArtistProfileHeroAdaptiveIntro and by the Marketing/Sections/feature-split story.',
      },
    },
  },
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
  },
} satisfies Meta<typeof ArtistProfileAdaptiveSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SectionAdaptive: Story = {};
