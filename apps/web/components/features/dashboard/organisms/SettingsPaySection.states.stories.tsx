import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { expect, within } from 'storybook/test';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { APP_ROUTES } from '@/constants/routes';
import type { ProfileMonetizationSummaryResponse } from '@/lib/profile-monetization';
import { queryKeys } from '@/lib/queries/keys';
import { SettingsPaySection } from './SettingsPaySection';

const activeSummary: ProfileMonetizationSummaryResponse = {
  paymentState: 'active',
  provider: 'stripe',
  manageHref: APP_ROUTES.SETTINGS_PAYMENTS,
  tipUrl: 'https://jov.ie/story-artist/pay',
  tipVisits: 214,
  tipsReceived: 18,
  totalReceivedCents: 42_500,
  monthReceivedCents: 8_200,
  narrative: "You've received 18 tips totaling $425.00.",
};

function makeClient(seed: ProfileMonetizationSummaryResponse | 'error') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const queryKey = queryKeys.dashboard.monetizationSummary();
  if (seed === 'error') {
    client
      .getQueryCache()
      .build<ProfileMonetizationSummaryResponse, Error>(client, { queryKey })
      .setState({
        status: 'error',
        error: new Error('Summary unavailable'),
        fetchStatus: 'idle',
      });
  } else {
    client.setQueryData(queryKey, seed);
  }
  return client;
}

function shell(seed: ProfileMonetizationSummaryResponse | 'error') {
  return function PayStoryShell(Story: ComponentType) {
    return (
      <QueryClientProvider client={makeClient(seed)}>
        <PreviewPanelProvider>
          <div className='max-w-2xl'>
            <Story />
          </div>
        </PreviewPanelProvider>
      </QueryClientProvider>
    );
  };
}

function withRtl(Story: ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for the payments settings panel; same query seeding as the base stories. */
const meta = {
  title: 'Dashboard/Organisms/SettingsPaySection States',
  component: SettingsPaySection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SettingsPaySection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: payments are live but no fan has opened the link yet. */
export const EmptyNoActivity: Story = {
  decorators: [
    shell({
      ...activeSummary,
      paymentState: 'ready_no_activity',
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
      narrative: 'No visits yet. Share your link or QR to start.',
    }),
  ],
};

/** Error: the summary failed to load and offers a retry. */
export const ErrorSummaryFailed: Story = {
  decorators: [shell('error')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Could not load your payments summary right now.')
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Try Again' })
    ).toBeVisible();
  },
};

/** Long content: large totals and a long pay link. */
export const LongContentTotals: Story = {
  decorators: [
    shell({
      ...activeSummary,
      tipUrl:
        'https://jov.ie/an-artist-with-an-exceptionally-long-profile-handle/pay',
      tipVisits: 1_284_301,
      tipsReceived: 98_765,
      totalReceivedCents: 987_654_321,
      monthReceivedCents: 12_345_678,
      narrative: '98765 fans paid you $9,876,543 total.',
    }),
  ],
};

/** Right-to-left: the live payments panel inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [shell(activeSummary), withRtl],
};
