import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { ImpersonationState } from '@/lib/queries/useImpersonationQuery';
import { ImpersonationBanner } from './ImpersonationBanner';

const baseState: ImpersonationState = {
  enabled: true,
  isImpersonating: true,
  effectiveUserId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  timeRemainingMs: 125_000,
  timeRemainingMinutes: 2,
  expiresAt: 0,
};

function StateProvider({
  state,
  children,
}: {
  readonly state: ImpersonationState | undefined;
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (state) {
    queryClient.setQueryData(queryKeys.admin.impersonation(), state);
  }
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function stateDecorator(state: ImpersonationState | undefined) {
  return function ImpersonationStateDecorator(Story: () => ReactNode) {
    return (
      <StateProvider state={state}>
        <div className='min-h-24 bg-surface-1 pt-12'>
          <Story />
        </div>
      </StateProvider>
    );
  };
}

const meta = {
  title: 'Features/Admin/ImpersonationBanner/States',
  component: ImpersonationBanner,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['onEnd', 'className'] },
  },
} satisfies Meta<typeof ImpersonationBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: no status data yet. The fixed banner renders nothing and reserves no space. */
export const Loading: Story = {
  decorators: [stateDecorator(undefined)],
};

/** Empty: the admin is not impersonating anyone, so no banner shows. */
export const EmptyNotImpersonating: Story = {
  decorators: [
    stateDecorator({
      ...baseState,
      isImpersonating: false,
      effectiveUserId: undefined,
      timeRemainingMs: 0,
    }),
  ],
};

/** Error: a failed status read leaves no data, so no banner shows. */
export const ErrorNoStatus: Story = {
  decorators: [stateDecorator(undefined)],
};

/** Partial: the target user id is missing from the status. */
export const PartialMissingUser: Story = {
  decorators: [stateDecorator({ ...baseState, effectiveUserId: undefined })],
};

/** Long content: a very long target id is cut to 16 characters. */
export const LongContentUserId: Story = {
  decorators: [
    stateDecorator({
      ...baseState,
      effectiveUserId:
        '11111111-1111-4111-8111-111111111111-with-a-very-long-suffix',
    }),
  ],
};

/** Offline: the countdown keeps running from the stored end time. */
export const OfflineCountdown: Story = {
  decorators: [stateDecorator({ ...baseState, timeRemainingMs: 59_000 })],
};

/** Permission denied: the banner is the admin-only signal that a session is acting as another user. */
export const PermissionDeniedActingAsUser: Story = {
  decorators: [stateDecorator(baseState)],
};

/** RTL: the banner mirrors under a right-to-left document. */
export const RtlBanner: Story = {
  decorators: [
    stateDecorator(baseState),
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
