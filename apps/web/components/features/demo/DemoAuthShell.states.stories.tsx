import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries';
import type { BillingStatusData } from '@/lib/queries/useBillingStatusQuery';
import { DemoAuthShell } from './DemoAuthShell';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';

/**
 * State coverage for the demo app shell. The canonical story stays in
 * DemoAuthShell.stories.tsx; these drive the same shell through its
 * dashboardData, releasesForQuery and seedQueryClient props.
 */
const StoryContent = ({ body }: { readonly body?: string }) => (
  <div className='p-6'>
    <div className='max-w-xl rounded-lg border border-subtle bg-surface-1 p-5'>
      <p className='text-app font-semibold text-primary-token'>
        Demo workspace
      </p>
      <p className='mt-2 text-sm leading-5 text-secondary-token'>
        {body ??
          'Authenticated demo chrome renders with seeded billing, release, and weekly message usage data.'}
      </p>
    </div>
  </div>
);

const meta = {
  title: 'Features/Demo/DemoAuthShell States',
  component: DemoAuthShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: <StoryContent />,
  },
} satisfies Meta<typeof DemoAuthShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no releases seeded, so the nav shows no release count. */
export const EmptyReleases: Story = {
  args: { releasesForQuery: [] },
};

/** Partial: a profile with no display name or avatar yet. */
export const PartialProfile: Story = {
  args: {
    dashboardData: {
      ...DEMO_DASHBOARD_DATA,
      selectedProfile: DEMO_DASHBOARD_DATA.selectedProfile
        ? {
            ...DEMO_DASHBOARD_DATA.selectedProfile,
            displayName: null,
            avatarUrl: null,
          }
        : null,
    },
  },
};

/** Long content: a long body inside the shell content area. */
export const LongContentBody: Story = {
  args: {
    children: (
      <StoryContent body='Authenticated demo chrome renders with seeded billing, release, and weekly message usage data. This deliberately long paragraph runs several lines so the shell content area can be checked for clean wrapping next to the open sidebar at every width, without pushing the header or the nav out of place.' />
    ),
  },
};

function seedFreePlan(client: QueryClient) {
  client.setQueryData<BillingStatusData>(queryKeys.billing.status(), {
    isPro: false,
    plan: 'free',
    hasStripeCustomer: false,
    stripeSubscriptionId: null,
    stale: false,
    staleReason: null,
    trialStartedAt: null,
    trialEndsAt: null,
    trialNotificationsSent: 0,
  });
}

/** Locked: a free plan, so paid shell features show as locked. */
export const LockedFreePlan: Story = {
  args: { seedQueryClient: seedFreePlan },
};

/** Right-to-left: the shell inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
