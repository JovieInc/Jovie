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

export const Empty: Story = {
  render: () => (
    <div className='flex h-6 w-40 items-center rounded-md border border-subtle px-2 text-xs text-tertiary-token'>
      <StackableBadgeGroup items={[]} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'An empty item list renders nothing, leaving the owning cell (outlined here) to decide its empty treatment.',
      },
    },
  },
};

export const ErrorState: Story = {
  args: {
    items: [
      { id: 'sync', label: 'Sync failed', icon: <span>!</span>, tone: 'error' },
      {
        id: 'deezer',
        label: 'Deezer rejected the release',
        icon: <span>Dz</span>,
        tone: 'error',
      },
      ITEMS[0],
    ],
    maxVisible: 3,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Error-toned items lead the stack with semantic error tokens; the full labels stay in the group name.',
      },
    },
  },
};

export const Partial: Story = {
  args: {
    items: [
      { id: 'spotify', label: 'Spotify' },
      { id: 'tidal', label: 'Tidal' },
      { id: 'amazon', label: 'Amazon Music' },
      { id: 'deezer', label: 'Deezer' },
    ],
    maxVisible: 3,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Items with only an id and label use the neutral tone and fall back to dot marks in the stacked slots.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <StackableBadgeGroup
        items={[
          {
            id: 'anghami',
            label: 'أنغامي للفنانين المستقلين',
            icon: <span>An</span>,
            tone: 'success',
          },
          { id: 'spotify', label: 'سبوتيفاي', icon: <span>Sp</span> },
          { id: 'apple', label: 'آبل ميوزك', icon: <span>Am</span> },
          { id: 'youtube', label: 'يوتيوب', icon: <span>Yt</span> },
        ]}
        maxVisible={3}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In right-to-left layouts the long Arabic primary label truncates, icons overlap at the logical start edge, and the overflow trigger follows.',
      },
    },
  },
};
