import type { MarketingFeatureTile } from './marketingFeatureTiles';

export const ARTIST_NOTIFICATIONS_SPEC_TILES: readonly MarketingFeatureTile[] =
  [
    {
      id: 'new-music-first',
      title: 'New music first',
      body: 'Keep the latest release at the front of the return path so fans have one clean next action.',
      size: 'large',
      accent: 'blue',
      kicker: 'Release moment',
      layoutClassName:
        'xl:col-start-1 xl:row-start-1 xl:col-span-5 xl:row-span-2',
      visual: 'screenshot',
      screenshotSrc: '/product-screenshots/tim-white-profile-listen-phone.png',
      screenshotAlt:
        'Jovie artist profile showing the latest release at the top of the page.',
      screenshotWidth: 660,
      screenshotHeight: 1368,
      objectPosition: '50% 0%',
    },
    {
      id: 'nearby-show-timing',
      title: 'Nearby show timing',
      body: 'Put the right date in front of the right fans while ticket intent is still warm.',
      size: 'large',
      accent: 'orange',
      kicker: 'Tour timing',
      layoutClassName:
        'xl:col-start-6 xl:row-start-1 xl:col-span-4 xl:row-span-2',
      visual: 'screenshot',
      screenshotSrc:
        '/product-screenshots/artist-spec-geo-insights-desktop.png',
      screenshotAlt:
        'Jovie geo insights showing cities where fan attention is building.',
      screenshotWidth: 344,
      screenshotHeight: 540,
      objectPosition: '50% 0%',
    },
    {
      id: 'capture-once',
      title: 'Capture once',
      body: 'A stream, QR scan, or profile visit can become a fan Jovie can reach again.',
      size: 'small',
      accent: 'green',
      kicker: 'Audience capture',
      layoutClassName:
        'xl:col-start-10 xl:row-start-1 xl:col-span-3 xl:row-span-1',
      visual: 'screenshot',
      screenshotSrc:
        '/product-screenshots/tim-white-profile-subscribe-phone.png',
      screenshotAlt:
        'Jovie artist profile showing the subscribe surface for fan capture.',
      screenshotWidth: 660,
      screenshotHeight: 1368,
      objectPosition: '50% 0%',
    },
    {
      id: 'always-in-sync',
      title: 'Always in sync',
      body: 'Notifications stay tied to the live release and profile state without manual rebuilding.',
      size: 'small',
      accent: 'pink',
      kicker: 'Live updates',
      layoutClassName:
        'xl:col-start-10 xl:row-start-2 xl:col-span-3 xl:row-span-1',
      visual: 'screenshot',
      screenshotSrc:
        '/product-screenshots/artist-spec-sync-settings-desktop.png',
      screenshotAlt:
        'Jovie settings showing always-in-sync controls for artist surfaces.',
      screenshotWidth: 970,
      screenshotHeight: 518,
      objectPosition: '50% 50%',
    },
    {
      id: 'one-profile-same-destination',
      title: 'One profile, same destination',
      body: 'The same artist profile can stay in bio, stories, QR, and posts while notifications route fans back to the right place.',
      size: 'large',
      accent: 'teal',
      kicker: 'Unified routing',
      layoutClassName:
        'xl:col-start-1 xl:row-start-3 xl:col-span-12 xl:row-span-2',
      visual: 'screenshot',
      screenshotSrc: '/product-screenshots/profile-desktop.png',
      screenshotAlt:
        'Jovie artist profile on desktop with the primary release destination in view.',
      screenshotWidth: 1440,
      screenshotHeight: 900,
      objectPosition: '50% 0%',
    },
  ] as const;
