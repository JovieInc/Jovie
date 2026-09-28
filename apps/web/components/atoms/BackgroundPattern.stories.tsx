import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BackgroundPattern } from './BackgroundPattern';

const meta = {
  title: 'Atoms/BackgroundPattern',
  component: BackgroundPattern,
  parameters: {
    layout: 'centered',
  },
  args: {
    variant: 'grid',
  },
  render: args => (
    <div className='relative h-48 w-72 overflow-hidden rounded-lg border border-subtle bg-surface-0'>
      <BackgroundPattern {...args} />
    </div>
  ),
} satisfies Meta<typeof BackgroundPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {};

export const Dots: Story = {
  args: {
    variant: 'dots',
  },
};

export const Gradient: Story = {
  args: {
    variant: 'gradient',
  },
};
