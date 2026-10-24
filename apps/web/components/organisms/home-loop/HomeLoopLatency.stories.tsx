import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeLoopLatency } from './HomeLoopLatency';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopLatency',
  component: HomeLoopLatency,
  parameters: { layout: 'padded' },
  args: {
    rows: [
      {
        id: 'remediation:classified',
        label: 'Remediation · Classified',
        p50: '54m',
        p95: '2.3d',
        samples: 126,
        regressed: true,
      },
      {
        id: 'shipping:ready',
        label: 'Shipping · Ready',
        p50: '3m',
        p95: '6.5h',
        samples: 571,
        regressed: false,
      },
      {
        id: 'shipping:pr-open',
        label: 'Shipping · PR Open',
        p50: '8m',
        p95: '4.2h',
        samples: 570,
        regressed: false,
      },
    ],
    otherRegressions: ['Remediation · Red → Green'],
    coverage: '14 of 31 stages measured',
  },
} satisfies Meta<typeof HomeLoopLatency>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRegressions: Story = {};
export const Clean: Story = {
  args: {
    otherRegressions: [],
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
  },
};

export const NotMeasured: Story = {
  args: {
    rows: [
      {
        id: 'shipping:ready',
        label: 'Shipping · Ready',
        p50: 'Not measured',
        p95: 'Not measured',
        samples: 0,
        regressed: false,
      },
    ],
    otherRegressions: [],
    coverage: '0 of 31 stages measured',
  },
};

export const Empty: Story = {
  args: { rows: [], otherRegressions: [], coverage: null },
};
