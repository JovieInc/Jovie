import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DotBadge } from './DotBadge';

const meta = {
  title: 'Atoms/DotBadge',
  component: DotBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Active',
    variant: {
      className: 'border-success bg-success-subtle text-success',
      dotClassName: 'bg-success',
    },
  },
} satisfies Meta<typeof DotBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ConstrainedDestructiveLabel: Story = {
  args: {
    label: 'Destructive Action Requires Review',
    variant: {
      className: 'border-error bg-error-subtle text-error',
      dotClassName: 'bg-error',
    },
  },
  decorators: [
    StoryComponent => (
      <div className='w-28'>
        <StoryComponent />
      </div>
    ),
  ],
};

/** A long label wraps inside its badge instead of clipping. */
export const LongContent: Story = {
  args: {
    label: 'Awaiting Distributor Approval For Every Territory',
    size: 'sm',
  },
  decorators: [
    StoryComponent => (
      <div className='w-36'>
        <StoryComponent />
      </div>
    ),
  ],
};

export const Rtl: Story = {
  args: {
    label: 'نشط',
  },
  decorators: [
    StoryComponent => (
      <div dir='rtl' lang='ar'>
        <StoryComponent />
      </div>
    ),
  ],
};
