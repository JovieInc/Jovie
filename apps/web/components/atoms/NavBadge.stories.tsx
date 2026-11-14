import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NavBadge } from './NavBadge';

const meta = {
  title: 'Atoms/NavBadge',
  component: NavBadge,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof NavBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Count: Story = {
  args: {
    variant: 'count',
    count: 3,
  },
};

/** A count past two digits collapses to 99+ and keeps the badge compact. */
export const OverflowCount: Story = {
  args: {
    variant: 'count',
    count: '99+',
  },
};

export const Pro: Story = {
  args: {
    variant: 'pro',
  },
};

export const New: Story = {
  args: {
    variant: 'new',
  },
};

/** Callers pass zero when nothing is waiting; the badge still keeps its size. */
export const EmptyZeroCount: Story = {
  args: {
    variant: 'count',
    count: 0,
  },
};

/** A long, unabbreviated count stays on one compact line. */
export const LongContentCount: Story = {
  args: {
    variant: 'count',
    count: '1,284',
  },
};

export const RtlCount: Story = {
  args: {
    variant: 'count',
    count: '٣',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='flex items-center gap-2 text-sm'>
        المحادثات
        <Story />
      </div>
    ),
  ],
};
