import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  CompactReleasePlanUpgradeCard,
  ReleasePlanUpgradeInterstitial,
  TasksWorkspaceUpgradeInterstitial,
} from './TasksUpgradeInterstitial';

function UpgradeQueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Dashboard/Tasks/TasksUpgradeInterstitial',
  parameters: {
    layout: 'padded',
    jovie: {
      // heading/description/secondaryLabel are owned by the internal
      // TasksUpgradeContent; the exported wrappers bind them to fixed copy.
      uncoveredProps: ['heading', 'description', 'secondaryLabel'],
    },
  },
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <Story />
      </UpgradeQueryProvider>
    ),
  ],
} satisfies Meta<typeof TasksWorkspaceUpgradeInterstitial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Workspace: Story = {
  render: () => (
    <div className='h-96'>
      <TasksWorkspaceUpgradeInterstitial />
    </div>
  ),
};

export const ReleasePlan: Story = {
  render: () => (
    <ReleasePlanUpgradeInterstitial releaseTitle='Skyline Dreams' />
  ),
};

export const CompactCard: Story = {
  render: () => <CompactReleasePlanUpgradeCard onDismiss={() => {}} />,
};
