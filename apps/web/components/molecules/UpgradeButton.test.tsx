import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UpgradeButton } from './UpgradeButton';

const { mutateMock, checkoutState, pathnameMock, routerPushMock } = vi.hoisted(
  () => ({
    mutateMock: vi.fn(),
    checkoutState: {
      isPending: false,
      error: null as Error | null,
    },
    pathnameMock: vi.fn(() => '/app/chat'),
    routerPushMock: vi.fn(),
  })
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
  usePathname: () => pathnameMock(),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: () => true,
}));

vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({
    mutate: mutateMock,
    isPending: checkoutState.isPending,
    error: checkoutState.error,
  }),
}));

describe('UpgradeButton', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    // Default: the session request stays in flight (no redirect side effects).
    mutateMock.mockImplementation(() => {});
    checkoutState.isPending = false;
    checkoutState.error = null;
    pathnameMock.mockReturnValue('/app/chat');
    routerPushMock.mockReset();
  });

  afterEach(() => {
    checkoutState.error = null;
    checkoutState.isPending = false;
  });

  it('defaults its label to the canonical Artist Presence plan name', () => {
    render(<UpgradeButton />);

    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
  });

  it('respects explicit children over the default label', () => {
    render(<UpgradeButton>See plans</UpgradeButton>);

    expect(
      screen.getByRole('button', { name: 'See plans' })
    ).toBeInTheDocument();
  });

  it('passes the triggering feature route through to the checkout session', () => {
    render(<UpgradeButton priceId='price_123' from='/app/presence' />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );

    expect(mutateMock).toHaveBeenCalledWith(
      { priceId: 'price_123', from: '/app/presence' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('defaults from to the current pathname when it is an allowlisted feature', () => {
    render(<UpgradeButton priceId='price_123' />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );

    expect(mutateMock).toHaveBeenCalledWith(
      { priceId: 'price_123', from: '/app/chat' },
      expect.anything()
    );
  });

  it('drops from when the pathname is not an allowlisted feature route', () => {
    pathnameMock.mockReturnValue('/billing/success');
    render(<UpgradeButton priceId='price_123' />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );

    expect(mutateMock).toHaveBeenCalledWith(
      { priceId: 'price_123', from: null },
      expect.anything()
    );
  });

  it('keeps the accessible name and one status owner while the session is created', () => {
    checkoutState.isPending = true;
    render(<UpgradeButton priceId='price_123' />);

    const button = screen.getByRole('button', {
      name: 'Upgrade to Artist Presence',
    });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-pending-presentation', 'morph');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Opening checkout');
    // Duplicate submits are blocked by the morph presentation, not by
    // swapping the label to "Loading…" (which jumps the bounding box).
    fireEvent.click(button);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('announces checkout failure beside the button and preserves the retry intent', async () => {
    checkoutState.error = new Error('Stripe unavailable');
    const { container } = render(<UpgradeButton priceId='price_123' />);

    // Error feedback is a role=alert beside the button (JOV-9035), and the
    // pay intent (same plan label, same price id + from on retry) survives
    // the failure — nothing resets what the user chose.
    expect(screen.getByRole('alert')).toHaveTextContent('Stripe unavailable');
    expect(
      screen.getByRole('button', {
        name: 'Could not start checkout Try again',
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(mutateMock).toHaveBeenCalledWith(
      { priceId: 'price_123', from: '/app/chat' },
      expect.anything()
    );

    await expectNoA11yViolations(container);
  });

  it('redirects to the Stripe checkout url once the session is created', () => {
    const originalLocation = globalThis.location;
    const locationStub = { href: 'http://localhost/' };
    Object.defineProperty(globalThis, 'location', {
      value: locationStub,
      configurable: true,
      writable: true,
    });

    try {
      mutateMock.mockImplementation((_input, options) => {
        options?.onSuccess?.({ url: 'https://checkout.stripe.com/pay/cs_1' });
      });
      render(<UpgradeButton priceId='price_123' />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
      );

      expect(mutateMock).toHaveBeenCalledTimes(1);
      expect(locationStub.href).toBe('https://checkout.stripe.com/pay/cs_1');
    } finally {
      Object.defineProperty(globalThis, 'location', {
        value: originalLocation,
        configurable: true,
        writable: true,
      });
    }
  });

  it('routes the traditional flow to the pricing page', () => {
    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole('button'));

    expect(routerPushMock).toHaveBeenCalledWith('/pricing');
  });
});
