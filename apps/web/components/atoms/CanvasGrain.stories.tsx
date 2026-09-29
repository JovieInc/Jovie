import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CanvasGrain } from './CanvasGrain';

const meta = {
  title: 'Atoms/CanvasGrain',
  component: CanvasGrain,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='relative h-48 w-72 overflow-hidden rounded-lg bg-base'>
      <CanvasGrain {...args} />
    </div>
  ),
} satisfies Meta<typeof CanvasGrain>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnSurface: Story = {
  render: args => (
    <div className='relative h-48 w-72 overflow-hidden rounded-lg bg-surface-1'>
      <CanvasGrain {...args} />
    </div>
  ),
};
