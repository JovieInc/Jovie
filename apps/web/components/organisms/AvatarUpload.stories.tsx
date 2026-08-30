import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AvatarUpload } from './AvatarUpload';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const meta = {
  title: 'Organisms/AvatarUpload',
  component: AvatarUpload,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  decorators: [
    (Story: () => ReactNode) => (
      <QueryClientProvider client={queryClient}>
        <div className='w-[36rem] max-w-[90vw] rounded-xl border border-subtle bg-surface-1 p-6'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    artistName: 'Jordan Lee',
    currentAvatarUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop',
  },
} satisfies Meta<typeof AvatarUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Fallback: Story = {
  args: {
    currentAvatarUrl: null,
  },
};
