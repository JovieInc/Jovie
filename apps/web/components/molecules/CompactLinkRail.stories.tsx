import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { CompactLinkRailItem } from './CompactLinkRail';
import { CompactLinkRail } from './CompactLinkRail';

const items: CompactLinkRailItem[] = [
  {
    id: 'instagram',
    platformIcon: 'instagram',
    platformName: 'Instagram',
    primaryText: '12.4k',
    onClick: fn(),
  },
  {
    id: 'spotify',
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: '8.1k',
    onClick: fn(),
  },
  {
    id: 'youtube',
    platformIcon: 'youtube',
    platformName: 'YouTube',
    primaryText: '3.2k',
    onClick: fn(),
  },
];

const meta = {
  title: 'Molecules/CompactLinkRail',
  component: CompactLinkRail,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-64 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    items,
    countLabel: 'platforms',
  },
} satisfies Meta<typeof CompactLinkRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleItem: Story = {
  args: {
    items: items.slice(0, 1),
  },
};

export const MaxVisibleTwo: Story = {
  args: {
    maxVisible: 2,
  },
};

export const Empty: Story = {
  args: {
    items: [],
  },
};
