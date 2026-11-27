import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ReviewInboxPilotWorkbench } from './ReviewInboxPilotWorkbench';

const client = new QueryClient();

const meta = {
  title: 'Features/Admin/ReviewInbox/ReviewInboxPilotWorkbench',
  component: ReviewInboxPilotWorkbench,
  decorators: [
    (Story: () => ReactNode) => (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ReviewInboxPilotWorkbench>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
