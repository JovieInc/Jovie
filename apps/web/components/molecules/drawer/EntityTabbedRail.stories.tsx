import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';
import { EntityHeaderCard } from './EntityHeaderCard';
import { EntityTabbedRail } from './EntityTabbedRail';

const tabOptions = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
  { value: 'sources', label: 'Sources' },
] as const;

const meta = {
  title: 'Molecules/Drawer/EntityTabbedRail',
  component: EntityTabbedRail,
  parameters: { layout: 'fullscreen' },
  args: {
    isOpen: true,
    ariaLabel: 'Visitor details',
    activeTab: 'details',
    onTabChange: fn(),
    tabOptions,
    tabsAriaLabel: 'Visitor tabs',
    title: 'Visitor',
    entityHeader: (
      <EntityHeaderCard
        layout='grid'
        image={<DrawerEntityAvatar name='Visitor' />}
        title='Visitor'
        subtitle='Berlin · 18 visits'
      />
    ),
    children: <p className='text-sm text-secondary-token'>Visitor details</p>,
  },
} satisfies Meta<typeof EntityTabbedRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { isEmpty: true, emptyMessage: 'No visitor data yet.' },
};
