import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FunnelMetricsStrip } from './FunnelMetricsStrip';

const meta = {
  title: 'Features/Admin/FunnelMetricsStrip',
  component: FunnelMetricsStrip,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'metrics',
        'title',
        'value',
        'subtitle',
        'icon',
        'description',
      ],
    },
  },
} satisfies Meta<typeof FunnelMetricsStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
