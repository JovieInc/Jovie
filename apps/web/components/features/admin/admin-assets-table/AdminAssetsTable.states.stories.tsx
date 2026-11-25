import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminAssetsTable } from './AdminAssetsTable';
import { assets } from './story-fixtures';

const statesQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

const meta = {
  title: 'Admin/Tables/Assets/States',
  component: AdminAssetsTable,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function AssetsStatesFrame(Story) {
      return (
        <QueryClientProvider client={statesQueryClient}>
          <div className='h-160 bg-base text-primary-token'>
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
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

/** Empty: no asset matches the filters. */
export const EmptyNoMatches: Story = {
  args: { assets: [], total: 0, search: 'zzz' },
};

/** Long content: a very long title, subtitle and owner name stay inside their cells. */
export const LongContentTitles: Story = {
  args: {
    assets: [
      {
        ...assets[0],
        title:
          'A very long release title that keeps going well past the width of the asset column to prove truncation',
        subtitle:
          'Deluxe expanded anniversary edition with every remix, alternate take and live recording ever made',
        ownerDisplayName:
          'An artist with an extremely long display name that should truncate cleanly',
      },
    ],
    total: 1,
  },
};

/** Right-to-left: Arabic title and owner name in an RTL admin page. */
export const RtlArabicTitles: Story = {
  args: {
    assets: [
      {
        ...assets[0],
        title: 'ضوء الصباح الأول',
        subtitle: 'ألبوم · 2026',
        ownerDisplayName: 'فنان مستقل',
      },
    ],
    total: 1,
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
