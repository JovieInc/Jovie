import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { userEvent, within } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import { queryKeys } from '@/lib/queries/keys';
import { UsageMenuItem } from './UsageMenuItem';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity },
  },
});

queryClient.setQueryData(queryKeys.chat.usage(), {
  plan: 'pro',
  weeklyLimit: 70,
  used: 20,
  remaining: 50,
  resetAt: '2026-08-24T18:00:00.000Z',
  isExhausted: false,
  warningThreshold: 14,
  isNearLimit: false,
});

const meta: Meta<typeof UsageMenuItem> = {
  title: 'Organisms/UserButton/UsageMenuItem',
  component: UsageMenuItem,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Compact plan-usage disclosure used inside the signed-in user dropdown.',
      },
    },
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className='w-80 rounded-lg border border-subtle bg-surface-1 p-1 shadow-lg'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    usageStatsUrl: APP_ROUTES.SETTINGS_USAGE,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /usage remaining/i })
    );
  },
};
