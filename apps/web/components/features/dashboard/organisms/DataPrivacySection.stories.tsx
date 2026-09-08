import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataPrivacySection } from './DataPrivacySection';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const meta = {
  title: 'Dashboard/Organisms/DataPrivacySection',
  component: DataPrivacySection,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className='max-w-2xl'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof DataPrivacySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
