import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardHeader } from './DashboardHeader';

const meta = {
  title: 'Features/Dashboard/Organisms/DashboardHeader',
  component: DashboardHeader,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['breadcrumbs'],
    },
  },
} satisfies Meta<typeof DashboardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
