import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieInFlightBlockers } from './OvieInFlightBlockers';

const pr = (n: number, title: string) => ({
  id: `linear:JOV-${n}`,
  label: `#${n} ${title}`,
  url: `https://github.com/JovieInc/Jovie/pull/${n}`,
});

const meta = {
  title: 'Features/Admin/Hud/OvieInFlightBlockers',
  component: OvieInFlightBlockers,
  parameters: { layout: 'padded' },
  args: {
    moreHref: '/app/ov/shipping',
    summary: {
      total: 32,
      stuck: 27,
      moving: 5,
      groups: [
        {
          reason: 'Source validation failing',
          count: 13,
          prs: [
            pr(23801, 'feat(onboarding): gate access'),
            pr(23802, 'fix(ci): count canaries'),
          ],
        },
        {
          reason: 'PR body lacks fleet evidence',
          count: 12,
          prs: [pr(23803, 'fix(symphony): honor priority')],
        },
        {
          reason: 'Not marked ready',
          count: 6,
          prs: [pr(23804, 'feat(agents): attest routes')],
        },
        {
          reason: 'Agent run failed',
          count: 3,
          prs: [pr(23805, 'fix(profile): canonical launch')],
        },
      ],
      movingPrs: [pr(23806, 'fix(table): prevent render spikes')],
    },
  },
} satisfies Meta<typeof OvieInFlightBlockers>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Stuck: Story = {};
export const NothingStuck: Story = {
  args: {
    summary: {
      total: 1,
      stuck: 0,
      moving: 1,
      groups: [],
      movingPrs: [pr(23806, 'fix(table): prevent render spikes')],
    },
  },
};
