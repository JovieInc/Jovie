import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  computePmfMetrics,
  type PmfMetrics,
} from '@/lib/admin/pmf-metrics-model';
import { PmfMetricsPanel } from './PmfMetricsPanel';

const meta = {
  title: 'Features/Admin/Leads/PmfMetricsPanel States',
  component: PmfMetricsPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PmfMetricsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nobody admitted and no survey answers, so neither rate has a base. */
export const EmptyNoAdmittedUsers: Story = {
  args: {
    metrics: computePmfMetrics({
      admittedUsers: 0,
      activatedUsers: 0,
      surveyResponses: 0,
      veryDisappointed: 0,
    }),
  },
};

type PanelArgs = { readonly metrics: PmfMetrics | null };

function NarrowPanel(args: PanelArgs) {
  return (
    <div className='w-72'>
      <PmfMetricsPanel {...args} />
    </div>
  );
}

/** Long content: seven-figure counts wrapping in a narrow column. */
export const LongContentLargeCounts: Story = {
  args: {
    metrics: computePmfMetrics({
      admittedUsers: 4_821_300,
      activatedUsers: 1_930_512,
      surveyResponses: 912_408,
      veryDisappointed: 401_377,
    }),
  },
  render: NarrowPanel,
};

function RtlPanel(args: PanelArgs) {
  return (
    <div dir='rtl' lang='ar'>
      <PmfMetricsPanel {...args} />
    </div>
  );
}

/** RTL: the metric rows mirror in a right-to-left container. */
export const RtlMetricRows: Story = {
  args: {
    metrics: computePmfMetrics({
      admittedUsers: 48,
      activatedUsers: 19,
      surveyResponses: 12,
      veryDisappointed: 4,
    }),
  },
  render: RtlPanel,
};
