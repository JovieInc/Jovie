import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GrowthAccessRequestModal } from './GrowthAccessRequestModal';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const meta: Meta<typeof GrowthAccessRequestModal> = {
  title: 'Organisms/Billing/GrowthAccessRequestModal',
  component: GrowthAccessRequestModal,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    open: true,
    onOpenChange: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof GrowthAccessRequestModal>;

export const Default: Story = {};
