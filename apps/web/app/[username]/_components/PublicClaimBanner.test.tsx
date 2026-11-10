import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicClaimBanner } from './PublicClaimBanner';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const base = {
  profileHandle: 'dj tim',
  displayName: 'DJ Tim',
  directClaimSupported: true,
  isClaimed: false,
  visitorState: 'organic_unclaimed',
} as const;

describe('PublicClaimBanner', () => {
  afterEach(() => globalThis.history.replaceState({}, '', '/'));

  it('links an unclaimed profile to its encoded claim route without axe violations', async () => {
    const { container } = render(<PublicClaimBanner {...base} />);

    expect(
      screen.getByRole('link', { name: 'Claim Profile for DJ Tim' })
    ).toHaveAttribute('href', '/dj%20tim/claim?next=auth');
    await expectNoA11yViolations(container);
  });

  it('renders nothing for a claimed profile or its owner', () => {
    const { container, rerender } = render(
      <PublicClaimBanner {...base} isClaimed />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<PublicClaimBanner {...base} visitorState='owner' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('switches to the claim-intent copy when the URL gains ?claim=1', () => {
    render(<PublicClaimBanner {...base} />);
    expect(screen.getByText(/Is it yours\?/)).toBeInTheDocument();

    act(() => globalThis.history.pushState({}, '', '/dj-tim?claim=1'));

    expect(
      screen.getByText(
        'Your profile is ready. Claim it to turn on release emails.'
      )
    ).toBeInTheDocument();
  });

  it('drops the CTA when ownership needs manual verification', () => {
    render(
      <PublicClaimBanner
        {...base}
        directClaimSupported={false}
        claimRequiresVerification
      />
    );

    expect(screen.getByTestId('claim-banner')).toHaveTextContent(
      'Verified ownership is required'
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});
