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

/** A page taller than the frame is clipped by the fixed-ratio screen. */
export const LongContentClippedPage: Story = {
  args: {
    children: (
      <div className='space-y-3 p-4 text-sm text-primary-token'>
        {Array.from({ length: 30 }, (_, i) => `Link ${i + 1}`).map(label => (
          <p key={label}>
            {label}: a long destination label that wraps across the phone
          </p>
        ))}
      </div>
    ),
  },
};

/** The frame inside a right-to-left page. */
export const RtlPage: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
