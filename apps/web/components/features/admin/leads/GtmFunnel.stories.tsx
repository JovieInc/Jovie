import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GtmFunnelSkeleton } from './GtmFunnel';

const meta = {
  title: 'Features/Admin/Leads/GtmFunnel',
  component: GtmFunnelSkeleton,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['counts'],
    },
  },
} satisfies Meta<typeof GtmFunnelSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
