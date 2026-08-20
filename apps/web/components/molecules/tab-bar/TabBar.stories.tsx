import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TabBar } from './TabBar';

const options = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
  { value: 'sources', label: 'Sources' },
] as const;

const meta = {
  title: 'Molecules/Tab Bar/TabBar',
  component: TabBar,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: 'details',
    onValueChange: fn(),
    options,
    ariaLabel: 'Entity tabs',
    distribution: 'fill',
  },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Drawer: Story = {};

export const Segment: Story = {
  args: {
    variant: 'segment',
  },
};

export const Scroll: Story = {
  args: {
    overflowMode: 'scroll',
  },
};
