import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_PROFILE_DESKTOP_EVENTS } from '@/data/publicProfileDesktopOptimization';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ClaimBanner } from './ClaimBanner';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

// Behavior coverage for every variant lives in
// tests/components/profile/ClaimBanner.test.tsx; this file holds the
// certificate's a11y, interaction and RTL evidence.
describe('ClaimBanner certificate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has no axe violations with and without a CTA', async () => {
    const { container, rerender } = render(
      <ClaimBanner
        profileHandle='testartist'
        displayName='Test Artist'
        ctaHref='/testartist/claim?next=auth'
      />
    );
    await expectNoA11yViolations(container);

    rerender(<ClaimBanner profileHandle='testartist' variant='unsupported' />);
    await expectNoA11yViolations(container);
  });

  it('tracks the claim outcome when the CTA is pressed', async () => {
    const user = userEvent.setup();
    render(
      <ClaimBanner
        profileHandle='testartist'
        ctaHref='/claim/abc123'
        variant='claim_intent'
      />
    );

    const cta = screen.getByRole('link', {
      name: 'Claim Profile for testartist',
    });
    cta.addEventListener('click', event => event.preventDefault());
    await user.click(cta);

    expect(track).toHaveBeenCalledWith(
      PUBLIC_PROFILE_DESKTOP_EVENTS.OUTCOME,
      expect.objectContaining({
        profile_handle: 'testartist',
        destination: '/claim/[token]',
        variant: 'claim_intent',
      })
    );
  });

  it('aligns the banner copy to the reading start so RTL text does not flush left', () => {
    render(
      <div dir='rtl'>
        <ClaimBanner profileHandle='artist' />
      </div>
    );

    const copyRow = screen.getByText(/This profile is unclaimed/).parentElement;
    expect(copyRow).toHaveClass('sm:text-start');
    expect(copyRow).not.toHaveClass('sm:text-left');
  });
});
