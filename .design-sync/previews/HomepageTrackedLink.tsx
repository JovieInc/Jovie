// Authored preview — HomepageTrackedLink. An analytics-wrapped homepage link.
// Rendered as the real homepage CTAs (primary pill + secondary link) so the card
// shows the component in its actual styled context rather than a bare anchor.
import { HomepageTrackedLink } from 'apps/web/components';

export function PrimaryCta() {
  return (
    <HomepageTrackedLink
      href='/sign-up'
      className='public-action-primary focus-ring-themed'
      eventName='homepage_hero_cta_clicked'
      eventProperties={{ cta: 'primary', label: 'Start free' }}
    >
      Start free
    </HomepageTrackedLink>
  );
}

export function SecondaryLink() {
  return (
    <HomepageTrackedLink
      href='/artist-profiles'
      className='homepage-hero-secondary-link focus-ring-themed'
      eventName='homepage_hero_cta_clicked'
      eventProperties={{ cta: 'secondary', label: 'See a live profile' }}
    >
      See a live profile
    </HomepageTrackedLink>
  );
}
