import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
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

function makeClient(summary?: ProfileMonetizationSummaryResponse) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (summary) {
    client.setQueryData(queryKeys.dashboard.monetizationSummary(), summary);
  }
  return client;
}

// Holds the summary request open so the story shows the loading geometry
// that has to match the loaded surface (phone CLS 0.206 on /app/earnings).
function WithPendingSummary({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    const original = globalThis.fetch;
    originalFetchRef.current = original;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/dashboard/monetization-summary')) {
        return new Promise<Response>(() => {});
      }
      return original(input as RequestInfo, init);
    }) as typeof fetch;
    return () => {
      if (originalFetchRef.current) globalThis.fetch = originalFetchRef.current;
    };
  }, []);

  return <>{children}</>;
}

const meta = {
  title: 'Dashboard/Organisms/SettingsPaySection',
  component: SettingsPaySection,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof SettingsPaySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={makeClient(activeSummary)}>
        <PreviewPanelProvider>
          <div className='max-w-2xl'>
            <Story />
          </div>
        </PreviewPanelProvider>
      </QueryClientProvider>
    ),
  ],
};

export const Loading: Story = {
  decorators: [
    Story => (
      <WithPendingSummary>
        <QueryClientProvider client={makeClient()}>
          <PreviewPanelProvider>
            <div className='max-w-2xl'>
              <Story />
            </div>
          </PreviewPanelProvider>
        </QueryClientProvider>
      </WithPendingSummary>
    ),
  ],
};
