import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UsageMeter } from './UsageMeter';

const meta: Meta<typeof UsageMeter> = {
  title: 'Molecules/UsageMeter',
  component: UsageMeter,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Single weekly usage meter with one warning threshold and semantic healthy, warning, and exhausted states.',
      },
    },
  },
  decorators: [
    Story => (
      <div className='w-96 rounded-xl border border-subtle bg-surface-1'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Weekly Messages',
    resetLabel: 'Resets Aug 24, 11:00 AM',
    model: {
      used: 20,
      limit: 70,
      remaining: 50,
      remainingPercent: 71,
      state: 'healthy',
      resetAt: '2026-08-24T18:00:00.000Z',
      warningRemainingPercent: 20,
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

export const Warning: Story = {
  args: {
    model: {
      used: 58,
      limit: 70,
      remaining: 12,
      remainingPercent: 17,
      state: 'warning',
      resetAt: '2026-08-24T18:00:00.000Z',
      warningRemainingPercent: 20,
    },
  },
};

export const Exhausted: Story = {
  args: {
    model: {
      used: 70,
      limit: 70,
      remaining: 0,
      remainingPercent: 0,
      state: 'exhausted',
      resetAt: '2026-08-24T18:00:00.000Z',
      warningRemainingPercent: 20,
    },
  },
};
