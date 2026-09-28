import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useQueryClient } from '@tanstack/react-query';
import { QueryProvider } from './QueryProvider';

function QueryProviderStatus() {
  const queryClient = useQueryClient();
  const staleTime = queryClient.getDefaultOptions().queries?.staleTime;

  return (
    <p className='text-primary-token text-sm'>
      Query client ready · {Number(staleTime) / 60_000} minute stale time
    </p>
  );
}

const meta = {
  title: 'Providers/QueryProvider',
  component: QueryProvider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Application query boundary with the production client defaults and hydration-safe development tools.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof QueryProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: {
    children: <QueryProviderStatus />,
  },
};
