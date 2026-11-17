import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { HudMetrics } from '@/types/hud';
import { HudSystemHealthStrip } from './HudSystemHealthStrip';

// Only the slices the strip reads; the full HudMetrics payload is server-built.
const largeMetrics = {
  gbrain: {
    status: 'ok',
    version: '0.42.0-canary.20261003.build.1184',
    checkedAtIso: '2026-10-03T12:00:00.000Z',
  },
  deployments: { availability: 'not_configured', current: null, recent: [] },
  testing: {
    quarantine: { activeCount: 12480, isValid: true, withinRetryBudget: false },
  },
  aiOps: { counts: { running: 3716 } },
} as unknown as HudMetrics;

const meta = {
  title: 'Features/Admin/Hud/HudSystemHealthStrip States',
  component: HudSystemHealthStrip,
  args: { metrics: largeMetrics },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudSystemHealthStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

type StripArgs = {
  readonly metrics: HudMetrics;
  readonly presentation?: 'section' | 'page';
};

function NarrowStrip(args: StripArgs) {
  return (
    <div className='w-80'>
      <HudSystemHealthStrip {...args} />
    </div>
  );
}

/** Long content: a long version string and large counts wrap the pills. */
export const LongContentLargeCounts: Story = { render: NarrowStrip };

function RtlStrip(args: StripArgs) {
  return (
    <div dir='rtl' lang='ar'>
      <HudSystemHealthStrip {...args} />
    </div>
  );
}

/** RTL: the pills flow from the right in a right-to-left container. */
export const RtlHealthStrip: Story = { render: RtlStrip };
