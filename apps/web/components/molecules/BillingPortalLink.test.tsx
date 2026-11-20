import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BillingPortalLink } from './BillingPortalLink';

type MutateOptions = {
  onSuccess: (data: { url: string }) => void;
  onError: (error: unknown) => void;
};

const { mutate, mutationState, track } = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutationState: { isPending: false, error: null as unknown },
  track: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  usePortalMutation: () => ({ mutate, ...mutationState }),
}));

vi.mock('@/lib/analytics', () => ({ track }));

beforeEach(() => {
  mutate.mockReset();
  track.mockReset();
  mutationState.isPending = false;
  mutationState.error = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BillingPortalLink', () => {
  it('tracks the click and redirects to the portal url on success', async () => {
    const user = userEvent.setup();
    const location = { href: 'https://jov.ie/app/billing' };
    vi.stubGlobal('location', location);
    mutate.mockImplementation((_vars: undefined, options: MutateOptions) =>
      options.onSuccess({ url: 'https://billing.stripe.com/session/test' })
    );
    const { container } = render(<BillingPortalLink />);

    await user.click(screen.getByRole('button', { name: 'Manage Billing' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenNthCalledWith(1, 'billing_portal_clicked', {
      source: 'billing_dashboard',
    });
    expect(track).toHaveBeenNthCalledWith(2, 'billing_portal_redirect', {
      source: 'billing_dashboard',
    });
    expect(location.href).toBe('https://billing.stripe.com/session/test');
    await expectNoA11yViolations(container);
  });

  it('tracks a failed portal session with its message', async () => {
    const user = userEvent.setup();
    mutate.mockImplementation((_vars: undefined, options: MutateOptions) =>
      options.onError(new Error('Billing portal is unavailable'))
    );
    render(<BillingPortalLink>Update payment method</BillingPortalLink>);

    await user.click(
      screen.getByRole('button', { name: 'Update payment method' })
    );
    expect(track).toHaveBeenLastCalledWith('billing_portal_error', {
      error: 'Billing portal is unavailable',
      source: 'billing_dashboard',
    });
  });

  it('disables the button and shows loading copy while pending', async () => {
    const user = userEvent.setup();
    mutationState.isPending = true;
    const { container } = render(<BillingPortalLink />);

    const button = screen.getByRole('button', { name: 'Loading...' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(mutate).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows an error or offline message under the button', async () => {
    mutationState.error = new TypeError('Failed to fetch');
    const { container, unmount } = render(<BillingPortalLink />);
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    mutationState.error = 'unknown';
    render(<BillingPortalLink />);
    expect(
      screen.getByText('Failed to access billing portal')
    ).toBeInTheDocument();
  });

  it('keeps a long label and an Arabic label on the button', async () => {
    const { container } = render(
      <div>
        <BillingPortalLink size='sm' variant='primary'>
          Update payment method, invoices and billing address
        </BillingPortalLink>
        <div dir='rtl' lang='ar'>
          <BillingPortalLink size='lg'>إدارة الفواتير</BillingPortalLink>
        </div>
      </div>
    );

    expect(
      screen.getByRole('button', {
        name: 'Update payment method, invoices and billing address',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'إدارة الفواتير' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
