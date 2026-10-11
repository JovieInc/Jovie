import { cleanup, fireEvent, render } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { trackFunnelStep } = vi.hoisted(() => ({ trackFunnelStep: vi.fn() }));
vi.mock('@/lib/analytics/signup-funnel-client', () => ({ trackFunnelStep }));

const { isSignupEntryHref, SignupFunnelBeacon } = await import(
  './SignupFunnelBeacon'
);

const ORIGIN = 'https://jov.ie';

describe('isSignupEntryHref', () => {
  it.each([
    ['/signup', true],
    ['/start?plan=pro', true],
    ['/tim/claim?next=auth', true],
    ['https://jov.ie/onboarding', true],
    ['/pricing', false],
    ['https://evil.example/signup', false],
  ])('%s -> %s', (href, expected) => {
    expect(isSignupEntryHref(href, ORIGIN)).toBe(expected);
  });
});

describe('SignupFunnelBeacon', () => {
  afterEach(() => {
    cleanup();
    trackFunnelStep.mockClear();
  });

  it('tracks one landing view and a cta click for signup links only', () => {
    const { container } = render(
      <div>
        <SignupFunnelBeacon surface='homepage' />
        <Link href='/signup'>
          <span>Start free</span>
        </Link>
        <Link href='/pricing'>Pricing</Link>
      </div>
    );
    expect(trackFunnelStep).toHaveBeenCalledWith({
      funnel: 'artist_signup',
      step: 'landing_view',
      surface: 'homepage',
    });

    const [signup, pricing] = container.querySelectorAll('a');
    for (const link of [signup, pricing]) {
      link.addEventListener('click', event => event.preventDefault());
    }
    const label = signup.querySelector('span');
    if (label) fireEvent.click(label);
    fireEvent.click(pricing);

    expect(trackFunnelStep).toHaveBeenCalledTimes(2);
    expect(trackFunnelStep).toHaveBeenLastCalledWith({
      funnel: 'artist_signup',
      step: 'cta_click',
      surface: 'homepage',
    });
  });

  it('skips the landing view when told to', () => {
    render(<SignupFunnelBeacon surface='profile_claim' trackLanding={false} />);
    expect(trackFunnelStep).not.toHaveBeenCalled();
  });
});
