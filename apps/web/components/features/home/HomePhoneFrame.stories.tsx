import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomePhoneFrame } from './HomePhoneFrame';

const meta = {
  title: 'Features/Home/HomePhoneFrame',
  component: HomePhoneFrame,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: (
      <div className='flex h-full items-center justify-center text-sm text-white'>
        Screen content
      </div>
    ),
  },
} satisfies Meta<typeof HomePhoneFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    compact: true,
  },
};
