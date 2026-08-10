import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileAdaptiveSection } from './ArtistProfileAdaptiveSection';

const meta = {
  title: 'Marketing/Components/ArtistProfileAdaptiveSection',
  component: ArtistProfileAdaptiveSection,
  parameters: { layout: 'fullscreen' },
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
  },
  render: args => (
    <main className='bg-base text-primary-token'>
      <ArtistProfileAdaptiveSection {...args} />
    </main>
  ),
} satisfies Meta<typeof ArtistProfileAdaptiveSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PhoneRight: Story = {};
