import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofMetricGrid } from './ProofMetricGrid';

const meta = {
  title: 'Marketing/Proof/ProofMetricGrid States',
  component: ProofMetricGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithProofPage(Story) {
      return (
        <div className='bg-base px-6 py-16 text-primary-token'>
          <div className='mx-auto max-w-4xl'>
            <Story />
          </div>
        </div>
      );
    },
  ],
  args: { stats: [{ stat: resolvedFixture() }] },
} satisfies Meta<typeof ProofMetricGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no stats at all, so the grid renders nothing. */
export const EmptyStats: Story = {
  args: { stats: [] },
};

/** Partial: one publishable card beside a stale and a missing stat. */
export const PartialOnePublishable: Story = {
  args: {
    stats: [
      { stat: resolvedFixture({ measuredAt: null, methodology: null }) },
      { stat: HIDDEN_FIXTURE, label: 'Stale Stat' },
      { stat: null, label: 'Unresolved Stat' },
    ],
  },
};

/** Long content: long labels and values wrap inside each card. */
export const LongContentLabels: Story = {
  args: {
    stats: [1, 2, 3, 4].map(index => ({
      stat: resolvedFixture({
        id: `long_${index}`,
        value: `${index}00,000+`,
      }),
      label: `Accounts created by artists, managers and labels, cohort ${index}`,
    })),
  },
};

/** Right-to-left: Arabic labels in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    stats: [
      { stat: resolvedFixture(), label: 'الحسابات' },
      {
        stat: resolvedFixture({ id: 'profile_ttfb_ms', value: '70 ms' }),
        label: 'زمن الاستجابة',
      },
    ],
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
