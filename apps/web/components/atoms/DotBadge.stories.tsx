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
    label: 'Destructive action requires review',
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
