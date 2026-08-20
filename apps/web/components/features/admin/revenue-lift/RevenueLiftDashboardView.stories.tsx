import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RevenueLiftDashboardView } from '@/app/app/(shell)/admin/revenue-lift/RevenueLiftDashboardView';
import type { RevenueLiftDashboardData } from '@/lib/metrics/revenue-lift-dashboard';

const source = {
  label: 'Revenue metrics',
  source: 'workflow_run_outcomes',
  fetchedAtIso: new Date().toISOString(),
  state: 'ok' as const,
  errorMessage: null,
};

const tile = {
  id: 'gmv-lift',
  tier: 'B' as const,
  label: 'Direct GMV Lift',
  valueLabel: '$12,500',
  signal: 'Settled revenue attributed through automations.',
  vcInterpretation: 'Direct proof that Jovie actions create artist revenue.',
  source,
};

const data: RevenueLiftDashboardData = {
  generatedAtIso: source.fetchedAtIso,
  irpaa: null,
  irpaaPrior: null,
  irpaaSource: source,
  kpiTree: [
    { ...tile, id: 'irpaa', tier: 'A', label: 'IRPAA' },
    tile,
    {
      ...tile,
      id: 'new-fans',
      label: 'New Fans Delta',
      valueLabel: '842',
    },
  ],
  interpretationTable: [tile],
  cohorts: {
    activeCount: 24,
    controlCount: 18,
    activeMedianLiftCents: 24_00,
    controlMedianLiftCents: 3_00,
    rows: [],
    source,
  },
  agents: [
    {
      agent: 'outreach',
      totalTasks: 48,
      successRate: 0.875,
      humanOverrideRate: 0.083,
      costPerOpportunityUsd: 1.5,
      totalCostUsd: 72,
    },
  ],
  agentsSource: source,
};

const meta = {
  title: 'Features/Admin/Health Controls/RevenueLiftDashboardView',
  component: RevenueLiftDashboardView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen bg-surface-page p-4 sm:p-6'>
        <Story />
      </div>
    ),
  ],
  args: { data },
} satisfies Meta<typeof RevenueLiftDashboardView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
