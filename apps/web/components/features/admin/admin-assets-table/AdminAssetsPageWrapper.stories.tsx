import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { AdminAssetsPageWrapper } from './AdminAssetsPageWrapper';
import { assets } from './story-fixtures';

const storyQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

const meta = {
  title: 'Admin/Tables/AssetsPageWrapper',
  component: AdminAssetsPageWrapper,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <HeaderActionsProvider>
        <QueryClientProvider client={storyQueryClient}>
          <div className='h-160 bg-base text-primary-token'>
            <Story />
          </div>
        </QueryClientProvider>
      </HeaderActionsProvider>
    ),
  ],
  args: {
    assets,
    pageSize: 20,
    total: assets.length,
    search: '',
    sort: 'created_desc',
    type: 'all',
    issues: 'all',
    verified: 'all',
  },
} satisfies Meta<typeof AdminAssetsPageWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
