import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Users } from 'lucide-react';
import { KpiItem } from './KpiItem';

const meta = {
  title: 'Features/Admin/KpiItem',
  component: KpiItem,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Waitlisted',
    value: '1,842',
    metadata: '+62 this week',
    icon: Users,
  },
} satisfies Meta<typeof KpiItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
