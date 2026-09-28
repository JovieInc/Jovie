import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CanonicalContactMetrics } from '@/lib/admin/contacts';
import { CanonicalLifecycleFunnel } from './CanonicalLifecycleFunnel';

const metrics: CanonicalContactMetrics = {
  total: 1234,
  suggested: 900,
  approved: 120,
  outreach: 80,
  profile_created: 50,
  certified: 30,
  signed_up: 20,
  claimed: 14,
  activated: 10,
  paying: 8,
  churned: 2,
};

const meta = {
  title: 'Admin/Growth/CanonicalLifecycleFunnel',
  component: CanonicalLifecycleFunnel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen bg-surface-0 p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { metrics },
} satisfies Meta<typeof CanonicalLifecycleFunnel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    metrics: Object.fromEntries(
      Object.keys(metrics).map(key => [key, 0])
    ) as unknown as CanonicalContactMetrics,
  },
};
