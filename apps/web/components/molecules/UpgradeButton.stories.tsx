import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { UpgradeButton } from './UpgradeButton';

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
  title: 'Molecules/UpgradeButton',
  component: UpgradeButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <Story />
      </UpgradeQueryProvider>
    ),
  ],
  args: {
    variant: 'primary',
    size: 'md',
  },
} satisfies Meta<typeof UpgradeButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const CustomLabel: Story = {
  args: {
    children: 'Go Pro',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};
