import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pageMock, trackMock, useBillingStatusQueryMock } = vi.hoisted(() => ({
  pageMock: vi.fn(),
  trackMock: vi.fn(),
  useBillingStatusQueryMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/atoms/Confetti', () => ({
  ConfettiOverlay: (props: { readonly viewport?: boolean }) => (
    <div
      data-testid='confetti-overlay'
      data-viewport={props.viewport ? 'true' : 'false'}
    />
  ),
}));

vi.mock('@/lib/analytics', () => ({
  page: pageMock,
  track: trackMock,
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: useBillingStatusQueryMock,
}));

import CheckoutSuccessPage from './page';

describe('billing success page', () => {
  beforeEach(() => {
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    useBillingStatusQueryMock.mockReturnValue({
      data: {
        isPro: true,
        plan: 'pro',
      },
    });
  });

  it('keeps the standalone shell vertically scrollable', () => {
    render(<CheckoutSuccessPage />);
    const pageShell = screen.getByRole('main');

    expect(trackMock).toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(pageMock).toHaveBeenCalledWith(
      'checkout_success',
      expect.any(Object)
    );
    expect(screen.getByTestId('confetti-overlay')).toHaveAttribute(
      'data-viewport',
      'true'
    );
    expect(pageShell.className).toContain('overflow-y-auto');
    expect(pageShell.className).not.toContain('overflow-hidden');
    expect(
      screen.getByRole('button', { name: /request verification/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to Dashboard' })
    ).toHaveAttribute('href', '/app');
  });
});
