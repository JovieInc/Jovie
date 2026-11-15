import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { PayDrawer } from './PayDrawer';

type ApiMockGlobal = typeof globalThis & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

const meta = {
  title: 'Profile/PayDrawer States',
  component: PayDrawer,
  parameters: { checkout: 'unavailable' },
  args: {
    open: true,
    onOpenChange: fn(),
    artistName: 'Demo',
    artistHandle: 'demo',
    venmoLink: 'https://venmo.com/demo',
  },
  // The preview's API hook answers the checkout lookup without a backend.
  beforeEach: ({ parameters }) => {
    const target = globalThis as ApiMockGlobal;
    const previous = target.__jovieApiMock;
    target.__jovieApiMock = request => {
      if (request.url.pathname === '/api/tips/create-checkout') {
        return parameters.checkout === 'error'
          ? Response.json({ error: 'Checkout lookup failed' }, { status: 500 })
          : Response.json({ available: false });
      }
      return previous?.(request);
    };
    return () => {
      target.__jovieApiMock = previous;
    };
  },
} satisfies Meta<typeof PayDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the card checkout lookup failed, so only Venmo is offered. */
export const ErrorCheckoutLookup: Story = {
  parameters: { checkout: 'error' },
};

/** Partial: no Venmo username and a single amount. */
export const PartialSingleAmount: Story = {
  args: { venmoUsername: null, amounts: [10] },
};

/** Long content: a long artist name in the drawer title. */
export const LongContent: Story = {
  args: {
    artistName:
      'Tim White and the Late Night Los Angeles Orchestra featuring Everyone',
  },
};

/** Rtl: an Arabic artist name in a right-to-left document. */
export const Rtl: Story = {
  args: { artistName: 'تيم وايت' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
