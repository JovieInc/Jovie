import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatToolSurface } from './ChatToolSurface';

const meta = {
  title: 'Jovie/ChatToolSurface',
  component: ChatToolSurface,
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
    children: (
      <p className='p-3 text-sm text-primary-token'>Confirm this action?</p>
    ),
  },
} satisfies Meta<typeof ChatToolSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Success: Story = {
  args: {
    tone: 'success',
  },
};

export const Cancelled: Story = {
  args: {
    tone: 'cancelled',
  },
};

export const Flat: Story = {
  args: {
    tone: 'flat',
  },
};
