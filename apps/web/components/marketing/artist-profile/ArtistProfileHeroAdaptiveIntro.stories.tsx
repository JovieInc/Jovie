import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';

const meta = {
  title: 'Marketing/Components/ArtistProfileHeroAdaptiveIntro',
  component: ArtistProfileHeroAdaptiveIntro,
  parameters: { layout: 'fullscreen' },
  args: {
    hero: ARTIST_PROFILE_COPY.hero,
    adaptive: ARTIST_PROFILE_COPY.adaptive,
  },
  render: args => (
    <main className='bg-base text-primary-token'>
      <ArtistProfileHeroAdaptiveIntro {...args} />
    </main>
  ),
} satisfies Meta<typeof ArtistProfileHeroAdaptiveIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductionComposite: Story = {};
