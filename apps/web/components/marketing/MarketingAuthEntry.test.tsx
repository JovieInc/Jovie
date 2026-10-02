import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import LaunchPage from '@/app/(marketing)/launch/page';
import { SmartLinksLanding } from '@/app/(marketing)/smart-links/SmartLinksLanding';
import { LandingCTAButton } from '@/components/features/landing/LandingCTAButton';
import { ArtistNotificationsHero } from '@/components/marketing/artist-notifications/ArtistNotificationsHero';
import { HomepageV2Route } from '@/components/marketing/homepage-v2/HomepageV2Route';
import { HeaderNav } from '@/components/organisms/HeaderNav';
import { MarketingSignInLink } from '@/components/organisms/MarketingSignInLink';
import { VoicePageContent } from '@/components/organisms/VoicePageContent';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { MarketingHero } from './MarketingHero';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('@/components/molecules/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('@/components/features/landing/VoiceDemoVisual', () => ({
  VoiceDemoVisual: () => <div>Voice preview</div>,
}));
vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => <div>Trust proof</div>,
}));
vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      ComponentProps<'a'> & { prefetch?: boolean }
    >(function TestLink({ prefetch, onClick, href, ...props }, ref) {
      return (
        <a
          href={href ?? '#'}
          {...props}
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

function expectIntentOnly(link: HTMLElement, href: string) {
  expect(link).toHaveAttribute('href', href);
  expect(link).toHaveAttribute('data-test-prefetch', 'false');
}

describe('marketing auth entry waits for intent', () => {
  it('defers the notification trial destination while retaining ordinary public prefetch', () => {
    const hero = ARTIST_NOTIFICATIONS_COPY.hero;
    const view = render(<ArtistNotificationsHero hero={hero} />);
    const link = screen.getByRole('link', { name: hero.primaryCtaLabel });
    expectIntentOnly(link, '/signup?plan=pro');
    fireEvent.focus(link);
    fireEvent.mouseEnter(link);
    expectIntentOnly(link, '/signup?plan=pro');
    view.rerender(
      <ArtistNotificationsHero hero={{ ...hero, primaryCtaHref: '/pricing' }} />
    );
    expect(
      screen.getByRole('link', { name: hero.primaryCtaLabel })
    ).toHaveAttribute('data-test-prefetch', 'undefined');
  });

  it('defers both smart-link auth actions and preserves their attribution and the public example', () => {
    render(<SmartLinksLanding />);
    const links = screen.getAllByRole('link', { name: 'Create a Smart Link' });
    expect(links).toHaveLength(2);
    for (const [index, href] of [
      '/signup?source=smart-links',
      '/signup?source=smart-links&intent=create',
    ].entries()) {
      const link = links[index]!;
      expectIntentOnly(link, href);
      fireEvent.focus(link);
      fireEvent.click(link);
      expectIntentOnly(link, href);
    }
    expectIntentOnly(
      screen.getByRole('link', { name: 'Open the live example' }),
      '/tim/never-say-a-word?noredirect=1'
    );
  });

  it('defers both launch access actions without changing keyboard or click destinations', () => {
    render(<LaunchPage />);
    const links = screen.getAllByRole('link', { name: 'Request access' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expectIntentOnly(link, '/signup');
      fireEvent.focus(link);
      fireEvent.click(link);
      expectIntentOnly(link, '/signup');
    }
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute(
      'href',
      'mailto:hello@jov.ie'
    );
  });

  it.each(['marketing-glass', 'default'] as const)(
    'defers public header auth in %s',
    presentation => {
      render(
        <HeaderNav
          authMode='public-static'
          presentation={presentation}
          publicCta={{ href: '/signup', label: 'Get started' }}
        />
      );
      expectIntentOnly(
        screen.getByRole('link', { name: 'Get started' }),
        '/signup'
      );
      expectIntentOnly(screen.getByRole('link', { name: 'Log in' }), '/signin');
    }
  );

  it.each(['ghost', 'pill'] as const)(
    'preserves the %s sign-in destination',
    variant => {
      render(<MarketingSignInLink variant={variant} />);
      expectIntentOnly(
        screen.getByRole('link', { name: 'Sign in' }),
        '/signin'
      );
    }
  );

  it('preserves landing CTA tracking and waits to load dynamic auth', () => {
    render(
      <LandingCTAButton
        href='/start'
        label='Start voice cloning'
        eventName='voice_landing_cta_start'
        section='hero'
      />
    );
    const link = screen.getByRole('link', { name: 'Start voice cloning' });
    expectIntentOnly(link, '/start');
    fireEvent.click(link);
    expect(track).toHaveBeenCalledWith('voice_landing_cta_start', {
      section: 'hero',
    });
  });

  it('preserves ordinary hero prefetch and explicit opt-in', () => {
    const view = render(
      <MarketingHero
        headline='A clear profile'
        subtitle='Share your work'
        logos={false}
        primaryCta={{ label: 'Start', href: '/start' }}
        secondaryCta={{ label: 'Pricing', href: '/pricing' }}
      />
    );
    expectIntentOnly(screen.getByRole('link', { name: 'Start' }), '/start');
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'data-test-prefetch',
      'undefined'
    );
    view.rerender(
      <MarketingHero
        headline='A clear profile'
        subtitle='Share your work'
        logos={false}
        primaryCta={{ label: 'Start', href: '/start', prefetch: true }}
      />
    );
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
      'data-test-prefetch',
      'true'
    );
  });

  it('defers every existing voice auth action without changing its destination', () => {
    render(<VoicePageContent />);
    for (const id of [
      'voice-hero-primary-cta',
      'voice-trust-cta',
      'voice-final-cta',
    ]) {
      expectIntentOnly(screen.getByTestId(id), '/start');
    }
  });

  it('defers the existing new-homepage front door', () => {
    render(<HomepageV2Route />);
    expectIntentOnly(
      screen.getByTestId('homepage-v2-hero-primary-cta'),
      '/signup'
    );
  });
});
