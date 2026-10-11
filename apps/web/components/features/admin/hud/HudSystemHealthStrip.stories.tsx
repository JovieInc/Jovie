import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { HudMetrics } from '@/types/hud';
import cashBandMeta from './HudCashMrrBand.stories';
import { HudSystemHealthStrip } from './HudSystemHealthStrip';

// Only the slices the strip reads; the full HudMetrics payload is server-built.
function metrics({
  ledgerValid = true,
  withinRetryBudget = true,
  running = 2,
  gbrain = 'ok',
}: {
  readonly ledgerValid?: boolean;
  readonly withinRetryBudget?: boolean;
  readonly running?: number;
  readonly gbrain?: 'ok' | 'down' | 'unknown';
} = {}): HudMetrics {
  return {
    gbrain: {
      status: gbrain,
      version: gbrain === 'ok' ? '0.42.0' : null,
      checkedAtIso: '2026-10-03T12:00:00.000Z',
    },
    deployments: { availability: 'not_configured', current: null, recent: [] },
    testing: {
      quarantine: { activeCount: 3, isValid: ledgerValid, withinRetryBudget },
    },
    aiOps: { counts: { running } },
  } as unknown as HudMetrics;
}

const meta = {
  title: 'Features/Admin/Hud/HudSystemHealthStrip',
  component: HudSystemHealthStrip,
  args: { metrics: cashBandMeta.args.metrics },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HudSystemHealthStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Degraded: Story = {
  args: {
    metrics: metrics({
      ledgerValid: false,
      running: 0,
      gbrain: 'down',
    }),
  },
};

export const Standalone: Story = { args: { presentation: 'page' } };
