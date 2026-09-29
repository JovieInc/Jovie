import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerTabs } from './DrawerTabs';

const options = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
  { value: 'sources', label: 'Sources' },
] as const;

const meta = {
  title: 'Molecules/Drawer/DrawerTabs',
  component: DrawerTabs,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: 'details',
    onValueChange: fn(),
    options,
    ariaLabel: 'Entity tabs',
  },
} satisfies Meta<typeof DrawerTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ScrollOverflow: Story = {
  args: {
    overflowMode: 'scroll',
  },
};

export const WithActions: Story = {
  args: {
    actions: <span className='text-2xs text-tertiary-token'>Last 28 days</span>,
  },
};
