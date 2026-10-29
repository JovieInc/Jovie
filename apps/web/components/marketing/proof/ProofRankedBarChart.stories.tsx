import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProofRankedBarChart } from './ProofRankedBarChart';
import { HIDDEN_FIXTURE, resolvedFixture } from './proof-fixtures';

const COMPARATIVE = resolvedFixture({
  id: 'profile_lcp_rank',
  label: 'Load Speed',
  methodology: '/proof/methodology#profile_lcp_rank',
});

// Shapes only: anonymized platforms and round illustrative medians.
const ENTRIES = [
  { id: 'jovie', label: 'Jovie', value: 5400, self: true },
  { id: 'platform-b', label: 'Platform B', value: 12400 },
  { id: 'platform-c', label: 'Platform C', value: 8400 },
];

const meta = {
  title: 'Marketing/Proof/ProofRankedBarChart',
  component: ProofRankedBarChart,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-xl'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProofRankedBarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LowerIsBetter: Story = {
  args: {
    stat: COMPARATIVE,
    title: 'Largest contentful paint, mobile, median of 5 runs',
    entries: ENTRIES,
    unit: 'ms',
    better: 'lower',
  },
};

export const JovieNotFirst: Story = {
  args: {
    stat: COMPARATIVE,
    title: 'Total blocking time, mobile, median of 5 runs',
    entries: [
      { id: 'jovie', label: 'Jovie', value: 402, self: true },
      { id: 'platform-c', label: 'Platform C', value: 310 },
    ],
    unit: 'ms',
    better: 'lower',
  },
};

export const UnapprovedRendersNothing: Story = {
  args: {
    stat: { ...HIDDEN_FIXTURE, state: 'unapproved' },
    title: 'Largest contentful paint',
    entries: ENTRIES,
    unit: 'ms',
    better: 'lower',
  },
};
