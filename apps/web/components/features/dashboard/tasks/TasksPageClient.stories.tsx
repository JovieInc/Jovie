import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { TasksPageClient } from './TasksPageClient';

const meta = {
  title: 'Features/Dashboard/Tasks/TasksPageClient',
  component: TasksPageClient,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['loading', 'isLoading'],
    },
  },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof TasksPageClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
