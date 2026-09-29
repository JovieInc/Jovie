import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatTile } from './StatTile';

const meta = {
  title: 'Molecules/Drawer/StatTile',
  component: StatTile,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-40 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Views',
    value: '12.4k',
  },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    hint: '+8% vs last week',
  },
};
