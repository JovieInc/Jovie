import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PhoneFrame } from './PhoneFrame';

const meta = {
  title: 'Molecules/PhoneFrame',
  component: PhoneFrame,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: (
      <div className='flex h-full w-full items-center justify-center bg-surface-0 text-sm text-secondary-token'>
        Profile preview
      </div>
    ),
  },
} satisfies Meta<typeof PhoneFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomClassName: Story = {
  args: {
    className: 'scale-90',
  },
};
