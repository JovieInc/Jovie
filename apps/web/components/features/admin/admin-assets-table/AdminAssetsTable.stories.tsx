import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminAssetsTable } from './AdminAssetsTable';
import { assets } from './story-fixtures';

const storyQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

const meta = {
  title: 'Admin/Tables/Assets',
  component: AdminAssetsTable,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <QueryClientProvider client={storyQueryClient}>
        <div className='h-160 bg-base text-primary-token'>
          <Story />
        </div>
      </QueryClientProvider>
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
} satisfies Meta<typeof AdminAssetsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const IssuesOnly: Story = { args: { issues: 'issues' } };
