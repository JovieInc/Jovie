import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { queryKeys } from '@/lib/queries/keys';
import type { BillingStatusData } from '@/lib/queries/useBillingStatusQuery';
import { SmartLinkGateBanner } from './SmartLinkGateBanner';

const freeBilling: BillingStatusData = {
  isPro: false,
  plan: 'free',
  hasStripeCustomer: false,
  stripeSubscriptionId: null,
  stale: false,
  staleReason: null,
  trialStartedAt: null,
  trialEndsAt: null,
  trialNotificationsSent: 0,
};

function BillingStoryShell({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });
  queryClient.setQueryData(queryKeys.billing.status(), freeBilling);
  return (
    <QueryClientProvider client={queryClient}>
      <div className='max-w-md'>{children}</div>
    </QueryClientProvider>
  );
}

const withFreeBilling: Decorator = Story => (
  <BillingStoryShell>
    <Story />
  </BillingStoryShell>
);

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/SmartLinkGateBanner States',
  component: SmartLinkGateBanner,
  parameters: { layout: 'padded' },
  decorators: [withFreeBilling],
  args: { mode: 'unreleased', unreleasedCount: 3 },
} satisfies Meta<typeof SmartLinkGateBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: seven-digit counts wrap inside the narrow banner. */
export const LongContentLargeCounts: Story = {
  args: { mode: 'soft-cap', releasedCount: 1234567, softCap: 1000000 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('You have 1234567 smart links')
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Email support' })
    ).toBeVisible();
  },
};

/** Permission denied: a free plan cannot open pre-release pages. */
export const PermissionDeniedUnreleasedOnFreePlan: Story = {
  args: { mode: 'unreleased', unreleasedCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('complementary', { name: 'Smart link upgrade prompt' })
    ).toBeVisible();
    await expect(canvas.getByText('You have 1 upcoming release')).toBeVisible();
  },
};

/** Right-to-left: the soft-cap notice inside an RTL document. */
export const RtlSoftCap: Story = {
  args: { mode: 'soft-cap', releasedCount: 104, softCap: 100 },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('complementary', {
        name: 'Smart link limit notice',
      })
    ).toBeVisible();
  },
};
