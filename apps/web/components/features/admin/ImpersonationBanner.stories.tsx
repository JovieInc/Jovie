import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { ImpersonationState } from '@/lib/queries/useImpersonationQuery';
import { ImpersonationBanner } from './ImpersonationBanner';

const impersonationState: ImpersonationState = {
  enabled: true,
  isImpersonating: true,
  effectiveClerkId: 'user_active_impersonation_123456789',
  effectiveDbId: 'usr_active_123',
  realAdminClerkId: 'user_admin_123',
  timeRemainingMs: 125_000,
  timeRemainingMinutes: 2,
  expiresAt: Date.now() + 125_000,
};

function ImpersonationQueryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  queryClient.setQueryData(queryKeys.admin.impersonation(), impersonationState);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/ImpersonationBanner',
  component: ImpersonationBanner,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['onEnd', 'className', 'isLoading'],
    },
  },
  decorators: [
    Story => (
      <ImpersonationQueryProvider>
        <div className='min-h-24 bg-surface-1 pt-12'>
          <Story />
        </div>
      </ImpersonationQueryProvider>
    ),
  ],
} satisfies Meta<typeof ImpersonationBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
