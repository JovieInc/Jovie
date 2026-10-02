import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BillingPortalLink } from './BillingPortalLink';

function BillingQueryProvider({ children }: { readonly children: ReactNode }) {
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
  title: 'Molecules/BillingPortalLink',
  component: BillingPortalLink,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <BillingQueryProvider>
        <Story />
      </BillingQueryProvider>
    ),
  ],
  args: {
    variant: 'outline',
    size: 'md',
  },
} satisfies Meta<typeof BillingPortalLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
};

export const CustomLabel: Story = {
  args: {
    children: 'Update payment method',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};
