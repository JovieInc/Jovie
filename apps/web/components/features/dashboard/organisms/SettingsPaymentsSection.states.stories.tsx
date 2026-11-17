import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentType, type ReactNode, useLayoutEffect } from 'react';
import { expect, within } from 'storybook/test';
import { SettingsPaymentsSection } from './SettingsPaymentsSection';

type StripeConnectStatus = {
  connected: boolean;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  email: string | null;
  onboardingAvailable?: boolean;
};

type StatusReply = StripeConnectStatus | 'hang' | 'error' | 'offline';

/** Answers only the Stripe status request; every other fetch passes through. */
function WithStripeStatus({
  children,
  reply,
}: Readonly<{ children: ReactNode; reply: StatusReply }>) {
  useLayoutEffect(() => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (!url.includes('/api/stripe-connect/status')) {
        return original(input as RequestInfo, init);
      }
      if (reply === 'hang') return new Promise<Response>(() => {});
      if (reply === 'offline')
        return Promise.reject(new TypeError('Failed to fetch'));
      if (reply === 'error')
        return Promise.resolve(
          Response.json(
            { error: 'Stripe is not responding. Try again shortly.' },
            { status: 503 }
          )
        );
      return Promise.resolve(Response.json(reply));
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  }, [reply]);
  return <>{children}</>;
}

function stripe(reply: StatusReply) {
  return function StripeStatusDecorator(Story: ComponentType) {
    return (
      <WithStripeStatus reply={reply}>
        <div className='max-w-2xl'>
          <Story />
        </div>
      </WithStripeStatus>
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

const connected: StripeConnectStatus = {
  connected: true,
  onboardingComplete: true,
  payoutsEnabled: true,
  email: 'artist@example.com',
};

/** State coverage for the Stripe payouts panel. */
const meta = {
  title: 'Dashboard/Organisms/SettingsPaymentsSection States',
  component: SettingsPaymentsSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SettingsPaymentsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the status request has not answered yet. */
export const LoadingStatus: Story = {
  decorators: [stripe('hang')],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Loading payments')
    ).toBeVisible();
  },
};

/** Empty: no Stripe account is connected yet. */
export const EmptyNotConnected: Story = {
  decorators: [
    stripe({
      connected: false,
      onboardingComplete: false,
      payoutsEnabled: false,
      email: null,
    }),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', {
        name: 'Connect Stripe',
      })
    ).toBeVisible();
  },
};

/** Error: the status request failed and offers a retry. */
export const ErrorStatusFailed: Story = {
  decorators: [stripe('error')],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Unable to load payments')
    ).toBeVisible();
  },
};

/** Partial: connected, but Stripe onboarding is not finished. */
export const PartialOnboarding: Story = {
  decorators: [
    stripe({ ...connected, onboardingComplete: false, payoutsEnabled: false }),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Finish Stripe setup')
    ).toBeVisible();
  },
};

/** Long content: a very long payout email in the description. */
export const LongContentEmail: Story = {
  decorators: [
    stripe({
      ...connected,
      email:
        'payouts.for.an.artist.with.a.remarkably.long.business.address@international-music-collective.example.com',
    }),
  ],
};

/** Offline: the status request cannot reach the network. */
export const OfflineStatusFetch: Story = {
  decorators: [stripe('offline')],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Failed to load payment status')
    ).toBeVisible();
  },
};

/** Right-to-left: the connected panel inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [stripe(connected), withRtl],
};
