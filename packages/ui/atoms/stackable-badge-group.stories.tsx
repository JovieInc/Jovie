import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  StackableBadgeGroup,
  type StackableBadgeItem,
} from './stackable-badge-group';

const ITEMS: readonly StackableBadgeItem[] = [
  { id: 'spotify', label: 'Spotify', icon: <span>Sp</span>, tone: 'success' },
  { id: 'apple', label: 'Apple Music', icon: <span>Am</span>, tone: 'info' },
  { id: 'youtube', label: 'YouTube', icon: <span>Yt</span>, tone: 'error' },
];

const meta: Meta<typeof StackableBadgeGroup> = {
  title: 'UI/Atoms/StackableBadgeGroup',
  component: StackableBadgeGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { items: ITEMS, maxVisible: 3, density: 'dense', width: 'compact' },
};

export const LongPrimaryLabel: Story = {
  args: {
    items: [
      {
        id: 'long',
        label: 'Spotify for Artists with a deliberately long label',
        icon: <span>Sp</span>,
        tone: 'success',
      },
      ...ITEMS.slice(1),
    ],
    maxVisible: 2,
  },
};

export const WithDisabledItem: Story = {
  args: {
    items: [ITEMS[0], { ...ITEMS[1], disabled: true }, ITEMS[2]],
    maxVisible: 3,
  },
};

export const OverflowDisclosure: Story = {
  args: {
    items: [
      ...ITEMS,
      { id: 'soundcloud', label: 'SoundCloud', icon: <span>Sc</span> },
      { id: 'bandcamp', label: 'Bandcamp', icon: <span>Bc</span> },
    ],
    maxVisible: 1,
    width: 'standard',
  },
};

export const SelectedItem: Story = {
  args: {
    items: [ITEMS[0], { ...ITEMS[1], selected: true }, ITEMS[2]],
    maxVisible: 3,
  },
};
