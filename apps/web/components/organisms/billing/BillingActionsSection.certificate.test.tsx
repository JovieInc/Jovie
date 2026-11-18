import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BillingActionsSection } from './BillingActionsSection';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));

function wrapper({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection(
  props: Partial<React.ComponentProps<typeof BillingActionsSection>> = {}
) {
  const handlers = {
    setCancelDialogOpen: vi.fn(),
    handleCancelSubscription: vi.fn(),
  };
  const view = render(
    <BillingActionsSection
      cancelDialogOpen={false}
      cancelMutationPending={false}
      {...handlers}
      {...props}
    />,
    { wrapper }
  );
  return { ...view, ...handlers };
}

describe('BillingActionsSection certificate', () => {
  it('asks to open the cancel dialog and records the intent', async () => {
    const user = userEvent.setup();
    const { container, setCancelDialogOpen } = renderSection();

    expect(
      screen.getByRole('button', { name: /Payment & Invoices/ })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Cancel Subscription' })
    );

    expect(setCancelDialogOpen).toHaveBeenCalledWith(true);
    expect(track).toHaveBeenCalledWith('subscription_cancel_clicked', {
      source: 'billing_dashboard',
    });
    await expectNoA11yViolations(container);
  });

  it('confirms the cancellation from the open dialog', async () => {
    const user = userEvent.setup();
    const { baseElement, handleCancelSubscription } = renderSection({
      cancelDialogOpen: true,
    });

    const dialog = screen.getByRole('alertdialog', {
      name: 'Cancel your subscription?',
    });
    expect(within(dialog).getByText('Contact export')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel Subscription' })
    );

    expect(handleCancelSubscription).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(baseElement);
  });

  it('keeps the subscription when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    const { setCancelDialogOpen, handleCancelSubscription } = renderSection({
      cancelDialogOpen: true,
    });

    await user.click(screen.getByRole('button', { name: 'Keep Subscription' }));

    expect(setCancelDialogOpen).toHaveBeenCalledWith(false);
    expect(handleCancelSubscription).not.toHaveBeenCalled();
  });

  it('blocks a second confirmation while the cancellation is pending', async () => {
    const { baseElement, handleCancelSubscription } = renderSection({
      cancelDialogOpen: true,
      cancelMutationPending: true,
    });

    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog)
      .getAllByRole('button')
      .find(button => button.hasAttribute('disabled'));
    expect(confirm).toBeDefined();
    expect(handleCancelSubscription).not.toHaveBeenCalled();
    await expectNoA11yViolations(baseElement);
  });
});
