import type { PhoneShowcaseModeData } from '@/features/home/phone-showcase-modes';

/**
 * Mode labels for the artist-profiles landing page.
 * Uses fan-outcome language instead of the homepage's product-internal labels.
 * The phone screen content (JSX) is shared — only the surrounding copy differs.
 */
export const ARTIST_PROFILE_MODES: readonly PhoneShowcaseModeData[] = [
  {
    id: 'profile',
    headline: 'Before a drop, your profile becomes a countdown.',
    description:
      'Fans see the release date, tap Notify me, and come back on launch day.',
    outcome: 'Upcoming release',
    summary: 'Countdown + notify.',
  },
  {
    id: 'listen',
    headline: 'On release day, fans go straight to their preferred platform.',
    description: 'One tap. Spotify, Apple Music, YouTube Music. No friction.',
    outcome: 'Release day',
    summary: 'Smart routing to listen.',
  },
  {
    id: 'tour',
    headline: 'Nearby fans see local dates first.',
    description:
      "A fan in LA doesn't scroll through 30 cities. They see the closest show.",
    outcome: 'Touring',
    summary: 'Nearest date first.',
  },
  {
    id: 'pay',
    headline: 'Between sets, fans pay and join your audience.',
    description:
      'QR code at the merch table. Three preset amounts. You capture the email.',
    outcome: 'Live shows',
    summary: 'Payments become fans.',
  },
] as const;
