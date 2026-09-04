import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SentryMetricsCard } from './SentryMetricsCard';

const meta = {
  title: 'Features/Admin/SentryMetricsCard',
  component: SentryMetricsCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['metrics', 'icon'],
    },
  },
} satisfies Meta<typeof SentryMetricsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
