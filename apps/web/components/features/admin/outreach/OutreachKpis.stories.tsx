import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutreachKpis } from './OutreachKpis';

const meta = {
  title: 'Features/Admin/Outreach/OutreachKpis',
  component: OutreachKpis,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['counts', 'email', 'dm', 'manualReview', 'total'],
    },
  },
} satisfies Meta<typeof OutreachKpis>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
