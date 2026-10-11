import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { Sparkline } from './Sparkline';

const meta = {
  title: 'Shell/Sparkline',
  component: Sparkline,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    points: [12, 14, 11, 18, 22, 19, 24],
    trend: 'up',
    onHover: fn(),
  },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Up: Story = {};

export const Down: Story = {
  args: {
    points: [24, 19, 22, 18, 11, 14, 12],
    trend: 'down',
  },
};

export const Flat: Story = {
  args: {
    points: [16, 17, 16, 15, 16, 17, 16],
    trend: 'flat',
  },
};

export const WithHover: Story = {
  args: {
    hoverIdx: 3,
  },
};
