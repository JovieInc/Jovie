import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { GrowthAccessRequestModal } from './GrowthAccessRequestModal';

function QueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/Billing/GrowthAccessRequestModal',
  component: GrowthAccessRequestModal,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryProvider>
        <Story />
      </QueryProvider>
    ),
  ],
  args: {
    open: true,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof GrowthAccessRequestModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};
