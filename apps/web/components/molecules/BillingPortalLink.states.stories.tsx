import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { BillingPortalLink } from './BillingPortalLink';

function BillingQueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

type PortalStub = 'pending' | 'server-error' | 'offline';

/**
 * The portal session posts to /api/stripe/portal. Stories answer that one
 * route from a fixture so a click never leaves the browser; other requests
 * pass through untouched.
 */
function stubPortalRoute(mode: PortalStub) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (!String(input).includes('/api/stripe/portal'))
      return originalFetch(input, init);
    if (mode === 'pending') return new Promise<Response>(() => {});
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    return new Response(
      JSON.stringify({ error: 'Billing portal is unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function openPortal(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button'));
  return canvas;
}

/** Rendered states of the billing portal button, beside BillingPortalLink.stories.tsx. */
const meta = {
  title: 'Molecules/BillingPortalLink States',
  component: BillingPortalLink,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <BillingQueryProvider>
        <Story />
      </BillingQueryProvider>
    ),
  ],
  args: {
    variant: 'outline',
    size: 'md',
  },
} satisfies Meta<typeof BillingPortalLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the portal session is still being created, so the button waits. */
export const LoadingPortalSession: Story = {
  beforeEach: () => stubPortalRoute('pending'),
  play: async ({ canvasElement }) => {
    const canvas = await openPortal(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Loading...' })).toBeDisabled()
    );
  },
};

/** Error: the server refused the session and the message shows under the button. */
export const ErrorPortalUnavailable: Story = {
  beforeEach: () => stubPortalRoute('server-error'),
  play: async ({ canvasElement }) => {
    const canvas = await openPortal(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Manage Billing' })
      ).toBeEnabled()
    );
    await waitFor(() =>
      expect(canvasElement.querySelector('p.text-destructive')).not.toBeNull()
    );
  },
};

/** Offline: the request never reached the server, so the network error shows. */
export const OfflineNetworkError: Story = {
  beforeEach: () => stubPortalRoute('offline'),
  play: async ({ canvasElement }) => {
    await openPortal(canvasElement);
    await waitFor(() =>
      expect(canvasElement.querySelector('p.text-destructive')).not.toBeNull()
    );
  },
};

/** Partial: no label or size passed, so the defaults render. */
export const PartialDefaults: Story = {
  args: {
    variant: undefined,
    size: undefined,
  },
};

/** Long content: a long custom label in a narrow settings column. */
export const LongContentLabel: Story = {
  args: {
    children: 'Update payment method, invoices and billing address',
  },
  decorators: [
    Story => (
      <div className='w-60'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic label on a right-to-left settings page. */
export const RtlArabicLabel: Story = {
  args: {
    children: 'إدارة الفواتير',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
