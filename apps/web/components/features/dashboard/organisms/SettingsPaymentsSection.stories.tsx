import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { SettingsPaymentsSection } from './SettingsPaymentsSection';

type StripeConnectStatus = {
  connected: boolean;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  email: string | null;
  onboardingAvailable?: boolean;
};

function createStatusFetchMock(
  status: StripeConnectStatus,
  originalFetch: typeof fetch
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/stripe-connect/status')) {
      return Promise.resolve(
        new Response(JSON.stringify(status), { status: 200 })
      );
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function WithStripeStatus({
  children,
  status,
}: Readonly<{
  children: React.ReactNode;
  status: StripeConnectStatus;
}>) {
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = globalThis.fetch;
    globalThis.fetch = createStatusFetchMock(status, globalThis.fetch);
    return () => {
      if (originalFetchRef.current) {
        globalThis.fetch = originalFetchRef.current;
      }
    };
  }, [status]);

  return <>{children}</>;
}

const meta: Meta<typeof SettingsPaymentsSection> = {
  title: 'Dashboard/Organisms/SettingsPaymentsSection',
  component: SettingsPaymentsSection,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <div className='max-w-2xl'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  decorators: [
    Story => (
      <WithStripeStatus
        status={{
          connected: true,
          onboardingComplete: true,
          payoutsEnabled: true,
          email: 'artist@example.com',
        }}
      >
        <Story />
      </WithStripeStatus>
    ),
  ],
};

export const PlatformProfileUnavailable: Story = {
  decorators: [
    Story => (
      <WithStripeStatus
        status={{
          connected: false,
          onboardingComplete: false,
          payoutsEnabled: false,
          email: null,
          onboardingAvailable: false,
        }}
      >
        <Story />
      </WithStripeStatus>
    ),
  ],
};
