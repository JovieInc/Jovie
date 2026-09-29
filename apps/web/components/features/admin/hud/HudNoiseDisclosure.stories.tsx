import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HudNoiseDisclosure } from './HudNoiseDisclosure';

const meta = {
  title: 'Features/Admin/HudNoiseDisclosure',
  component: HudNoiseDisclosure,
  parameters: {
    layout: 'centered',
  },
  args: {
    id: 'flaky-tests',
    label: 'Flaky test noise (12)',
    children: (
      <p className='text-xs text-secondary-token'>
        12 unit tests flagged as flaky over the last 24h. Below the alerting
        threshold.
      </p>
    ),
  },
} satisfies Meta<typeof HudNoiseDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
