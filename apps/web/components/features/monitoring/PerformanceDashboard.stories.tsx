import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { PerformanceDashboard } from './PerformanceDashboard';

const SAMPLE_METRICS: Array<{
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}> = [
  { name: 'LCP', value: 1800, rating: 'good' },
  { name: 'CLS', value: 0.15, rating: 'needs-improvement' },
  { name: 'FID', value: 420, rating: 'poor' },
];

/**
 * PerformanceDashboard reads metrics from a `web-vitals` window CustomEvent
 * rather than a prop, so this decorator dispatches sample metrics after
 * mount instead of seeding args.
 */
function WithSampleMetrics({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  useEffect(() => {
    for (const metric of SAMPLE_METRICS) {
      globalThis.dispatchEvent(
        new CustomEvent('web-vitals', { detail: metric })
      );
    }
  }, []);
  return <>{children}</>;
}

const meta = {
  title: 'Features/Monitoring/PerformanceDashboard',
  component: PerformanceDashboard,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    showDebug: true,
  },
} satisfies Meta<typeof PerformanceDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const WithMetrics: Story = {
  decorators: [
    Story => (
      <WithSampleMetrics>
        <Story />
      </WithSampleMetrics>
    ),
  ],
};
