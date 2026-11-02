import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofMetricCard, ProofMetricGrid } from './ProofMetricGrid';

const meta = {
  title: 'Marketing/Proof/ProofMetricGrid',
  component: ProofMetricGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-4xl'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProofMetricGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpecGrid: Story = {
  args: {
    stats: [
      { stat: resolvedFixture(), label: 'Accounts' },
      {
        stat: resolvedFixture({
          id: 'profile_ttfb_ms',
          value: '70 ms',
          label: 'Response Time',
          methodology: '/proof/methodology#profile_ttfb_ms',
        }),
      },
      {
        stat: resolvedFixture({
          id: 'profile_agent_score',
          value: '90/100',
          label: 'Agent Readiness',
          methodology: '/proof/methodology#profile_agent_score',
        }),
      },
      { stat: HIDDEN_FIXTURE, label: 'Stale Stat' },
    ],
  },
};

export const AllHiddenRendersNothing: Story = {
  args: { stats: [{ stat: HIDDEN_FIXTURE }] },
};

export const SingleCard: Story = {
  args: { stats: [] },
  render: () => (
    <dl>
      <ProofMetricCard stat={resolvedFixture()} />
    </dl>
  ),
};
