import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { UpgradeButton } from './UpgradeButton';

function UpgradeQueryProvider({ children }: { readonly children: ReactNode }) {
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

/**
 * JOV-9035: the pay button's reachable pending/error states are driven by
 * the checkout mutation, so the stories stub fetch (never-resolving for
 * pending, 503 for error) and drive the real component through its real
 * trigger instead of faking props.
 */
function CheckoutFetchStub({
  mode,
  children,
}: {
  readonly mode: 'pending' | 'error';
  readonly children: ReactNode;
}) {
  useEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      mode === 'pending'
        ? new Promise(() => {})
        : Promise.resolve(
            new Response(JSON.stringify({ error: 'Stripe unavailable' }), {
              status: 503,
            })
          )) as typeof globalThis.fetch;
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [mode]);

  return <>{children}</>;
}

const meta = {
  title: 'Molecules/UpgradeButton',
  component: UpgradeButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <Story />
      </UpgradeQueryProvider>
    ),
  ],
  args: {
    variant: 'primary',
    size: 'md',
  },
} satisfies Meta<typeof UpgradeButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const CustomLabel: Story = {
  args: {
    children: 'Go Pro',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Pending: Story = {
  args: { priceId: 'price_123' },
  decorators: [
    (Story, { parameters }) => (
      <CheckoutFetchStub mode={parameters.checkoutStub ?? 'pending'}>
        <Story />
      </CheckoutFetchStub>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /upgrade to artist presence/i })
    );
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Opening checkout'
    );
  },
};

export const Error: Story = {
  args: { priceId: 'price_123' },
  parameters: { checkoutStub: 'error' },
  decorators: [
    (Story, { parameters }) => (
      <CheckoutFetchStub mode={parameters.checkoutStub ?? 'error'}>
        <Story />
      </CheckoutFetchStub>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /upgrade to artist presence/i })
    );
    await expect(await canvas.findByRole('alert')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: /could not start checkout/i })
    ).toBeInTheDocument();
  },
};
