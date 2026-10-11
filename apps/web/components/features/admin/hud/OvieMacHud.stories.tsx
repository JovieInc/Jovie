import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';
import { OvieMacHud } from './OvieMacHud';

const snapshot: OvieMacHudSnapshot = {
  alive: {
    cashUsd: null,
    weeklyBurnUsd: null,
    weeklyRevenueUsd: null,
    weeklyRevenueGrowthRate: null,
    available: false,
    status: 'unknown',
    reachesProfitBeforeZero: null,
    detail: '',
  },
  growth: {
    rate: 0,
    source: 'revenue',
    ycBar: 'not-figured-out',
    thisWeek: 0,
    lastWeek: 0,
    available: false,
    showChart: false,
  },
  shipping: {
    shipsThisWeek: 0,
    available: false,
    detail: '',
  },
  inFlightPullRequests: {
    availability: 'not_configured',
    totalOpen: 0,
    items: [],
    truncated: false,
    errorMessage: null,
  },
  generatedAtIso: '2026-09-16T00:00:00.000Z',
};

const meta = {
  title: 'Features/Admin/Hud/OvieMacHud',
  component: OvieMacHud,
  parameters: { layout: 'fullscreen', jovie: { uncoveredProps: ['snapshot'] } },
} satisfies Meta<typeof OvieMacHud>;
export default meta;
export const Default: StoryObj<typeof meta> = {
  args: { snapshot },
};
