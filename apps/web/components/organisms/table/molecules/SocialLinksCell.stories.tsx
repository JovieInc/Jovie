import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SocialLinksCell } from './SocialLinksCell';

const meta = {
  title: 'Organisms/Table/Molecules/SocialLinksCell',
  component: SocialLinksCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
  args: {
    links: [
      { id: 'l1', url: 'https://instagram.com/jovie', platform: 'instagram' },
      {
        id: 'l2',
        url: 'https://open.spotify.com/artist/jovie',
        platform: 'spotify',
      },
      { id: 'l3', url: 'https://tiktok.com/@jovie', platform: 'tiktok' },
    ],
  },
} satisfies Meta<typeof SocialLinksCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    links: [],
  },
};

export const FilteredToMusic: Story = {
  args: {
    filterPlatformType: 'music',
  },
};
