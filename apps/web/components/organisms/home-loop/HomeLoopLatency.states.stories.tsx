import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { HomeLoopLatencyRow } from '@/lib/home-loop/contract';
import { HomeLoopLatency } from './HomeLoopLatency';

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the slowest-stages table. The canonical stories stay in
 * HomeLoopLatency.stories.tsx; these change how much of the pipeline is
 * measured, the label length and the document direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopLatency States',
  component: HomeLoopLatency,
  parameters: { layout: 'padded' },
  args: {
    rows: [
      {
        id: 'shipping:ready',
        label: 'Shipping · Ready',
        p50: '3m',
        p95: '6.5h',
        samples: 571,
        regressed: false,
      },
    ],
    otherRegressions: [],
    coverage: '14 of 31 stages measured',
  },
} satisfies Meta<typeof HomeLoopLatency>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one stage measured, one not yet, with low coverage named. */
export const PartialMeasurement: Story = {
  args: {
    rows: [
      {
        id: 'shipping:ready',
        label: 'Shipping · Ready',
        p50: '3m',
        p95: '6.5h',
        samples: 571,
        regressed: false,
      },
      {
        id: 'shipping:verified',
        label: 'Shipping · Verified',
        p50: 'Not measured',
        p95: 'Not measured',
        samples: 0,
        regressed: false,
      },
    ],
    coverage: '2 of 31 stages measured',
  },
};

const longRows: HomeLoopLatencyRow[] = Array.from({ length: 10 }, (_, i) => ({
  id: `stage-${i}`,
  label:
    i === 0
      ? 'Remediation · Classified by the incident triage coordinator after the first page'
      : `Shipping · Stage ${i + 1}`,
  p50: `${i + 2}m`,
  p95: `${i + 1}.5h`,
  samples: 100 + i,
  regressed: i % 3 === 0,
}));

/** Long content: ten stages, a long label and a long list of other regressions. */
export const LongContentManyStages: Story = {
  args: {
    rows: longRows,
    otherRegressions: [
      'Remediation · Red → Green',
      'Shipping · PR Open → Merged',
      'Shipping · Merged → Verified',
      'Queue Wait',
    ],
  },
};

/** Right-to-left: the table inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    rows: [
      {
        id: 'rtl',
        label: 'الشحن · جاهز',
        p50: '3m',
        p95: '6.5h',
        samples: 571,
        regressed: true,
      },
    ],
  },
  decorators: [RtlFrame],
};
