import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { PayView } from './PayView';

type StoryApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;

/**
 * Answers the Stripe checkout capability lookup like a failing service, so
 * the story shows what fans see when it errors. Registered through the
 * preview's `__jovieApiMock` hook; nothing leaves the browser.
 */
function FailingCheckoutLookup({ children }: { readonly children: ReactNode }) {
  useLayoutEffect(() => {
    const mockWindow = window as Window & { __jovieApiMock?: StoryApiMock };
    const previous = mockWindow.__jovieApiMock;
    mockWindow.__jovieApiMock = request => {
      if (request.url.pathname !== '/api/tips/create-checkout') {
        return previous?.(request);
      }
      return Response.json(
        { error: 'Checkout temporarily unavailable' },
        { status: 503 }
      );
    };
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  }, []);
  return <>{children}</>;
}

const meta = {
  title: 'Profile/PayView',
  component: PayView,
  args: {
    artistHandle: 'demo',
    venmoLink: 'https://venmo.com/demo',
  },
} satisfies Meta<typeof PayView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PayNow: Story = {};

/** The checkout lookup fails: card payment is withheld and Venmo still works. */
export const ErrorCheckoutLookupFailed: Story = {
  decorators: [
    Story => (
      <FailingCheckoutLookup>
        <Story />
      </FailingCheckoutLookup>
    ),
  ],
};

/**
 * The lookup fails and the saved Venmo link is broken (not a venmo.com
 * address), so no payment route is left and the view says so plainly.
 */
export const ErrorNoPaymentRoute: Story = {
  args: {
    venmoLink: 'https://venmo-payments.example.net/demo',
  },
  decorators: [
    Story => (
      <FailingCheckoutLookup>
        <Story />
      </FailingCheckoutLookup>
    ),
  ],
};
