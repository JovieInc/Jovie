import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import {
  StackableBadgeGroup,
  type StackableBadgeItem,
} from './stackable-badge-group';

const ITEMS: readonly StackableBadgeItem[] = [
  {
    id: 'spotify',
    label: 'Spotify for Artists',
    icon: <span>Sp</span>,
    tone: 'success',
  },
  { id: 'apple', label: 'Apple Music', icon: <span>Am</span>, tone: 'info' },
  { id: 'youtube', label: 'YouTube', icon: <span>Yt</span>, tone: 'error' },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    icon: <span>Sc</span>,
    tone: 'warning',
  },
];

const meta: Meta<typeof StackableBadgeGroup> = {
  title: 'UI/Atoms/StackableBadgeGroup',
  component: StackableBadgeGroup,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Compact fixed-width badge stack for dense table cells. First item shows a label; overflow opens an accessible disclosure.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    maxVisible: { control: { type: 'number', min: 1, max: 6 } },
    density: { control: { type: 'select' }, options: ['dense', 'standard'] },
    width: { control: { type: 'select' }, options: ['compact', 'standard'] },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: ITEMS,
    maxVisible: 3,
    density: 'dense',
    width: 'compact',
  },
};

export const StandardSlot: Story = {
  args: {
    items: ITEMS,
    maxVisible: 3,
    density: 'standard',
    width: 'standard',
  },
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
    width: 'compact',
  },
};

export const WithDisabledItem: Story = {
  args: {
    items: [
      ITEMS[0],
      { ...ITEMS[1], disabled: true },
      ITEMS[2],
    ],
    maxVisible: 3,
  },
};
