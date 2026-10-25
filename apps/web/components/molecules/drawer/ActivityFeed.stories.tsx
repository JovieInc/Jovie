import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ActivityFeed, type EntityRailActivityItem } from './ActivityFeed';

const ITEMS: readonly EntityRailActivityItem[] = [
  {
    id: 'now',
    actor: 'Tim White',
    verb: 'edited',
    object: 'Midnight Drive',
    at: '2026-01-15T10:05:00Z',
  },
  {
    id: 'earlier-today',
    actor: 'Jovie',
    verb: 'linked',
    object: 'Spotify',
    at: '2026-01-15T09:00:00Z',
  },
  {
    id: 'yesterday',
    actor: 'Maya Vale',
    verb: 'approved',
    object: 'Tour poster',
    at: '2026-01-14T18:30:00Z',
  },
  {
    id: 'archive',
    actor: 'Jovie',
    verb: 'published',
    object: 'Lost in the Light',
    at: '2026-01-13T08:00:00Z',
  },
];

const meta = {
  title: 'Molecules/Drawer/ActivityFeed',
  component: ActivityFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    items: ITEMS,
  },
} satisfies Meta<typeof ActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    items: [],
  },
};

export const LongContent: Story = {
  args: {
    items: [
      {
        id: 'long',
        actor: 'The Very Long Artist Name and Collaborating Orchestra',
        verb: 'approved',
        object:
          'the extremely long tour poster revision for the summer festival run',
        at: '2026-01-15T10:05:00Z',
      },
    ],
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
};
