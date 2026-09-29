import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HudObservationStatus } from './HudObservationStatus';

const meta = {
  title: 'Features/Admin/HudObservationStatus',
  component: HudObservationStatus,
  parameters: {
    layout: 'centered',
  },
  args: {
    message: 'Shipping velocity refreshed from the last 24h of merged PRs.',
  },
} satisfies Meta<typeof HudObservationStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fresh: Story = {
  args: {
    state: 'fresh',
    freshnessLabel: 'Updated 2m ago',
  },
};

export const Stale: Story = {
  args: {
    state: 'stale',
    freshnessLabel: 'Updated 4h ago',
    onRetry: () => {},
  },
};

export const Unavailable: Story = {
  args: {
    state: 'unavailable',
    message: 'Could not reach the shipping-velocity data source.',
    onRetry: () => {},
  },
};
