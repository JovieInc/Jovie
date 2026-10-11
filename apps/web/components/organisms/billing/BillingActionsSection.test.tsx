import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BillingActionsSection } from './BillingActionsSection';

const track = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));
vi.mock('@/components/molecules/BillingPortalLink', () => ({
  BillingPortalLink: ({ children }: { children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));
vi.mock('@/components/molecules/ContentSectionHeader', () => ({
  ContentSectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    onConfirm,
    isLoading,
  }: {
    open: boolean;
    title: ReactNode;
    confirmLabel: ReactNode;
    onConfirm: () => void;
    isLoading: boolean;
  }) =>
    open ? (
      <div role='alertdialog' aria-label={String(title)}>
        <button type='button' disabled={isLoading} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

describe('BillingActionsSection', () => {
  it('opens the canonical confirmation flow and records intent', () => {
    const setCancelDialogOpen = vi.fn();
    render(
      <BillingActionsSection
        cancelDialogOpen={false}
        setCancelDialogOpen={setCancelDialogOpen}
        handleCancelSubscription={vi.fn()}
        cancelMutationPending={false}
      />
    );

    const cancelTrigger = screen.getByRole('button', {
      name: 'Cancel Subscription',
    });
    // Regression guard for JOV-6773: destructive is a value-preserving
    // alias of error (tailwind.config.js maps both to --color-error) --
    // this call site should stay on the canonical token, not drift back.
    expect(cancelTrigger.className).toContain('text-error');
    expect(cancelTrigger.className).not.toContain('text-destructive');

    fireEvent.click(cancelTrigger);

    expect(track).toHaveBeenCalledWith('subscription_cancel_clicked', {
      source: 'billing_dashboard',
    });
    expect(setCancelDialogOpen).toHaveBeenCalledWith(true);
  });

  it('wires destructive confirmation and pending state to the canonical owner', () => {
    const handleCancelSubscription = vi.fn();
    render(
      <BillingActionsSection
        cancelDialogOpen
        setCancelDialogOpen={vi.fn()}
        handleCancelSubscription={handleCancelSubscription}
        cancelMutationPending
      />
    );

    const dialog = screen.getByRole('alertdialog', {
      name: 'Cancel your subscription?',
    });
    const confirm = within(dialog).getByRole('button', {
      name: 'Cancel Subscription',
    });
    expect(dialog).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(handleCancelSubscription).not.toHaveBeenCalled();
  });
});
