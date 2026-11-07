import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TimeLeverage } from '@/lib/ovie/time-leverage';
import { TimeLeverageView } from './TimeLeverageCard';

const data: TimeLeverage = {
  schema: 'time-leverage/v1',
  observedAt: '2026-10-29T17:00:00.000Z',
  windowDays: 7,
  tim: {
    totalMinutes: 600,
    humanOnlyMinutes: 240,
    humanOnlyPct: 40,
    categories: [
      {
        id: 'taste_call',
        label: 'Taste call',
        class: 'human_only',
        minutes: 120,
      },
      {
        id: 'slop_flag',
        label: 'Flagged slop a machine should catch',
        class: 'automatable',
        minutes: 48,
      },
    ],
  },
  agent: { wastedAgentHours: 80, ciReworkRounds: 26, noOpWakes: 960 },
  proposals: [
    {
      id: 'agent-noop-wakes',
      title: 'Wake the coordinator only on state change',
      estimate: '17.3 agent-h/week',
      owner: 'Summer',
      score: 2.8,
    },
  ],
};

const meta = {
  title: 'Features/Admin/Hud/TimeLeverageCard',
  component: TimeLeverageView,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TimeLeverageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Weekly: Story = { args: { data } };
