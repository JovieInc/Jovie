import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LandingCTAButton } from './LandingCTAButton';
import landingMeta, {
  PublicPricing,
  PublicText,
  SignIn,
  Signup,
  Start,
} from './LandingCTAButton.stories';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      ComponentProps<'a'> & { prefetch?: boolean }
    >(function PrefetchObservedLink(
      { prefetch, href, onClick, ...props },
      ref
    ) {
      return (
        <a
          {...props}
          href={href ?? '#'}
          ref={ref}
          data-test-prefetch={String(prefetch)}
          onClick={event => {
            event.preventDefault();
            onClick?.(event);
          }}
        />
      );
    }),
  };
});

describe('LandingCTAButton navigation contract', () => {
  it.each([
    ['/start', 'false'],
    ['/signup', 'false'],
    ['/signin', 'false'],
    ['/app/chat?q=Make%20me%20merch', 'false'],
    ['/waitlist?from=invite', 'false'],
    ['/app/chat-other', 'undefined'],
    ['/waitlist/invite', 'undefined'],
    ['/pricing', 'undefined'],
    ['/support', 'undefined'],
  ])('preserves %s navigation and its prefetch boundary', (href, prefetch) => {
    render(
      <LandingCTAButton
        href={href}
        label='Continue'
        eventName='landing_cta_contract'
        section='hero'
      />
    );
    const link = screen.getByRole('link', { name: 'Continue' });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('data-test-prefetch', prefetch);
    fireEvent.click(link);
    expect(track).toHaveBeenCalledWith('landing_cta_contract', {
      section: 'hero',
    });
  });

  it('binds real story states to the component and retains the text action', () => {
    expect(landingMeta.component).toBe(LandingCTAButton);
    expect(landingMeta.args.href).toBe('/start');
    expect(Start).toEqual({});
    expect(Signup.args?.href).toBe('/signup');
    expect(SignIn.args?.href).toBe('/signin');
    expect(PublicPricing.args?.href).toBe('/pricing');
    render(<LandingCTAButton {...landingMeta.args} {...PublicText.args} />);
    const link = screen.getByRole('link', { name: 'Talk to the team' });
    expect(link).toHaveAttribute('data-variant', 'ghost');
    expect(link).toHaveAttribute('data-test-prefetch', 'undefined');
  });
});
