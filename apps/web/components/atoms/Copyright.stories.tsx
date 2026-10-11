import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copyright } from './Copyright';

const meta = {
  title: 'Atoms/Copyright',
  component: Copyright,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='rounded-md bg-base px-4 py-3'>
      <Copyright {...args} />
    </div>
  ),
} satisfies Meta<typeof Copyright>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};

export const Light: Story = {
  args: {
    variant: 'light',
  },
  render: args => (
    <div className='rounded-md bg-surface-1 px-4 py-3'>
      <Copyright {...args} />
    </div>
  ),
};

export const FixedYear: Story = {
  args: {
    year: 2024,
  },
};
