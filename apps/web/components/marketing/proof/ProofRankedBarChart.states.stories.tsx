import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolvedFixture } from './fixtures/proof-fixtures';
import { ProofRankedBarChart } from './ProofRankedBarChart';

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
  title: 'Marketing/Proof/ProofRankedBarChart States',
  component: ProofRankedBarChart,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithProofPage(Story) {
      return (
        <div className='bg-base px-6 py-16 text-primary-token'>
          <div className='mx-auto max-w-xl'>
            <Story />
          </div>
        </div>
      );
    },
  ],
  args: {
    stat: COMPARATIVE,
    title: 'Largest contentful paint, mobile, median of 5 runs',
    entries: ENTRIES,
    unit: 'ms',
    better: 'lower',
  },
} satisfies Meta<typeof ProofRankedBarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no entries, so the chart renders nothing. */
export const EmptyEntries: Story = {
  args: { entries: [] },
};

/** Partial: invalid rows drop out and the two valid rows still rank. */
export const PartialInvalidRows: Story = {
  args: {
    stat: { ...COMPARATIVE, methodology: null },
    entries: [
      ...ENTRIES.slice(0, 2),
      { id: 'platform-nan', label: 'Platform N', value: Number.NaN },
      { id: 'platform-neg', label: 'Platform M', value: -1 },
    ],
  },
};

/** Long content: many rows with long labels and a long title. */
export const LongContentManyRows: Story = {
  args: {
    title:
      'Largest contentful paint on a mid-range phone over a throttled connection, median of five cold runs per platform',
    better: 'higher',
    entries: Array.from({ length: 8 }, (_, index) => ({
      id: `platform-${index}`,
      label: index === 0 ? 'Jovie' : `Link-in-bio platform number ${index}`,
      value: 1000 + index * 750,
      self: index === 0,
    })),
  },
};

/** Right-to-left: Arabic labels in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    title: 'سرعة التحميل على الهاتف',
    entries: [
      { id: 'jovie', label: 'جوفي', value: 5400, self: true },
      { id: 'platform-b', label: 'منصة ب', value: 12400 },
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
