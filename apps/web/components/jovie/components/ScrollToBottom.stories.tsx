import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ScrollToBottom } from './ScrollToBottom';

const meta = {
  title: 'Jovie/ScrollToBottom',
  component: ScrollToBottom,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='relative h-32 w-64 bg-base'>
        <Story />
      </div>
    ),
  ],
  args: {
    visible: true,
    onClick: fn(),
  },
} satisfies Meta<typeof ScrollToBottom>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {};

export const Hidden: Story = {
  args: {
    visible: false,
  },
};
