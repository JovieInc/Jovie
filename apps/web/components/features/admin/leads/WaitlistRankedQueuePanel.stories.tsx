import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistRankedQueuePanel } from './WaitlistRankedQueuePanel';

const meta = {
  title: 'Features/Admin/Leads/WaitlistRankedQueuePanel',
  component: WaitlistRankedQueuePanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof WaitlistRankedQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ranked: Story = {
  args: {
    queue: {
      capacity: { dailyLimit: 10, usedToday: 4, autoAcceptEnabled: true },
      rows: [
        {
          entryId: 'a',
          artistName: 'Mid Artist',
          status: 'waitlisted',
          waitlistedAt: '2026-10-25T10:00:00.000Z',
          score: 61.4,
          components: { identity: 30, audience: 19.4, catalog: 0, intent: 12 },
          unmeasured: ['catalog'],
          followers: 3200,
          holdReason: 'hold_capacity_full',
        },
        {
          entryId: 'b',
          artistName: null,
          status: 'waitlisted',
          waitlistedAt: '2026-10-20T10:00:00.000Z',
          score: null,
          components: null,
          unmeasured: [],
          followers: null,
          holdReason: null,
        },
      ],
    },
  },
};

export const Unavailable: Story = { args: { queue: null } };
