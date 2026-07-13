import { APP_ROUTES } from '@/constants/routes';
import type { ArtistProfileLandingCopy } from './artistProfileCopy';

const PRO_SIGNUP_HREF = `${APP_ROUTES.SIGNUP}?plan=pro`;

export interface ArtistNotificationsLandingCopy {
  readonly seo: {
    readonly title: string;
    readonly description: string;
  };
  readonly hero: {
    readonly headline: string;
    readonly headlineLines?: readonly [string, string?];
    readonly subhead?: string;
    readonly primaryCtaLabel: string;
    readonly primaryCtaHref: string;
    readonly floatingCards: readonly {
      readonly id: string;
      readonly kind: 'capture' | 'subscribe' | 'email' | 'click' | 'outcome';
      readonly title: string;
      readonly detail?: string;
    }[];
  };
  readonly capture: ArtistProfileLandingCopy['capture'];
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
  readonly benefits: {
    readonly headline: string;
    readonly body: string;
    readonly items: readonly {
      readonly title: string;
      readonly body: string;
    }[];
  };
  readonly specWall: ArtistProfileLandingCopy['specWall'];
  readonly faq: ArtistProfileLandingCopy['faq'];
  readonly finalCta: ArtistProfileLandingCopy['finalCta'] & {
    readonly ctaHref: string;
  };
}

export const ARTIST_NOTIFICATIONS_COPY = {
  seo: {
    title: 'Automatic Artist Notifications',
    description:
      'Turn new music and nearby shows into repeat visits without writing campaigns.',
  },
  hero: {
    headline: 'Reach Every Fan Automatically.',
    headlineLines: ['Reach Every Fan.', 'Automatically.'],
    primaryCtaLabel: 'Start Pro Trial',
    primaryCtaHref: PRO_SIGNUP_HREF,
    floatingCards: [
      {
        id: 'capture',
        kind: 'capture',
        title: 'Alex visited your profile and opted in for notifications.',
      },
      {
        id: 'subscribe',
        kind: 'subscribe',
        title: 'Enable notifications',
        detail: 'alex@example.com',
      },
      {
        id: 'email',
        kind: 'email',
        title: 'Alex was emailed: "Quiet Year — out now."',
      },
      {
        id: 'click',
        kind: 'click',
        title: 'Alex streamed the release on Spotify.',
      },
      {
        id: 'outcome',
        kind: 'outcome',
        title: 'Alex bought two tickets to your Brooklyn show.',
      },
    ],
  },
  capture: {
    headline: 'Capture every fan.',
    subhead:
      'Turn streams, show traffic, QR scans, and support moments into a fan list Jovie can bring back.',
    body: 'Notifications only work because capture happens first. Every visit, scan, and support moment can become a reachable audience instead of a dead-end click.',
    action: {
      title: 'Get updates',
      detail: 'New music and nearby shows.',
      ctaLabel: 'Subscribe',
      confirmedLabel: 'Notifications Enabled',
    },
    notification: {
      appName: 'Jovie',
      timeLabel: 'now',
      title: 'Automatic artist notifications',
      detail: 'New music and nearby shows go out without manual blasts.',
    },
    audienceRails: [
      [
        {
          id: 'spotify-jason-la',
          icon: 'spotify',
          sentence: 'Jason in LA opened the latest release on Spotify.',
        },
        {
          id: 'email-brian',
          icon: 'email',
          sentence: 'Brian M subscribed after the show.',
        },
        {
          id: 'shows-london-o2',
          icon: 'shows',
          sentence: 'Ava in London saved the next O2 date.',
        },
        {
          id: 'qr-berlin-flyer',
          icon: 'qr',
          sentence: 'Mika in Berlin scanned the tour flyer.',
        },
      ],
      [
        {
          id: 'apple-tokyo',
          icon: 'apple',
          sentence: 'Kenji in Tokyo tapped through to Apple Music.',
        },
        {
          id: 'youtube-sao-paulo',
          icon: 'youtube',
          sentence: 'Luana in Sao Paulo watched the release clip.',
        },
        {
          id: 'subscribe-maya-notifications',
          icon: 'subscribe',
          sentence: 'Maya turned on artist notifications.',
        },
        {
          id: 'spotify-amelia-london',
          icon: 'spotify',
          sentence: 'Amelia in London saved the profile for later.',
        },
      ],
      [
        {
          id: 'shows-chicago',
          icon: 'shows',
          sentence: 'Marcus in Chicago checked the nearby date.',
        },
        {
          id: 'qr-miami-sticker',
          icon: 'qr',
          sentence: 'Sofia in Miami scanned the merch-table sticker.',
        },
        {
          id: 'email-nina',
          icon: 'email',
          sentence: 'Nina P confirmed email updates.',
        },
        {
          id: 'pay-diego-support',
          icon: 'pay',
          sentence: 'Diego supported at the merch table and stayed connected.',
        },
      ],
    ],
  },
  reactivation: {
    headline: 'Notify them automatically.',
    subhead:
      'When new music drops or a nearby show is coming up, Jovie brings the right fans back.',
    workflow: {
      columns: ['Trigger', 'Audience', 'Message', 'Destination'],
      rows: [
        {
          id: 'release',
          trigger: 'New release',
          audience: 'Fans who asked for music',
          message: 'New release alert',
          destination: 'Latest release page',
        },
        {
          id: 'tour',
          trigger: 'Nearby show',
          audience: 'Fans near the venue',
          message: 'Nearby show alert',
          destination: 'Ticket page',
        },
      ],
    },
    outputs: [
      {
        id: 'release-alerts',
        label: 'Drive streams',
        title: 'New music gets another listening moment.',
        detail: 'Subscribers go straight to the latest release.',
        destination: 'Email -> release page',
      },
      {
        id: 'nearby-show-alerts',
        label: 'Move ticket intent',
        title: 'Nearby shows get another ticket window.',
        detail: 'The right city sees the date while it still matters.',
        destination: 'Alert -> ticket page',
      },
      {
        id: 'thank-you',
        label: 'Bring fans back',
        title: 'Every send creates a real reason to return.',
        detail: 'No campaign writing. Just a clean next tap.',
        destination: 'Repeat visit -> artist profile',
      },
    ],
  },
  benefits: {
    headline: 'Bring fans back when it matters.',
    body: 'Notifications work when they create a second chance to stream or buy tickets without turning you into a campaign manager.',
    items: [
      {
        title: 'New music gets another listening moment.',
        body: 'When something new is live, subscribers get one clean reason to come back.',
      },
      {
        title: 'Nearby shows get another ticket window.',
        body: 'Fans close enough to act see the show while the date is still relevant.',
      },
      {
        title: 'You stay close without writing blasts.',
        body: 'Jovie handles the send so the workflow stays product-led, not campaign-led.',
      },
    ],
  },
  specWall: {
    headline: 'The details that make notifications convert.',
    subhead:
      'Capture, timing, and routing all matter if you want alerts to bring fans back.',
  },
  faq: {
    headline: 'Frequently Asked Questions',
    items: [
      {
        question: 'How does Jovie bring fans back?',
        answer:
          'Jovie turns captured audience into repeat visits. When new music drops or a nearby show matters, subscribers get a clean notification that sends them back to the right release or ticket page.',
      },
      {
        question: 'What kinds of moments can Jovie turn into notifications?',
        answer:
          'Jovie focuses on the two artist moments most likely to drive action: new music and nearby shows. That keeps the product tuned to the moments fans are most likely to tap.',
      },
      {
        question: 'Why use Jovie instead of writing email campaigns?',
        answer:
          'Because most artists do not want to become campaign operators. Jovie handles the send automatically so you can keep building the audience without writing blasts, formatting newsletters, or timing manual sends.',
      },
      {
        question: 'Where do fans land after they click?',
        answer:
          'Clicks go to the destination that fits the moment: the latest release when new music is live, or the relevant ticket page when a nearby show is worth acting on.',
      },
      {
        question: 'When does it make sense to turn on Pro?',
        answer:
          'Use free to capture demand first. Turn on Pro when you want Jovie to start bringing those fans back automatically when music or show moments happen.',
      },
    ],
  },
  finalCta: {
    headline: 'Ready to Amplify?',
    subhead:
      'Capture demand on free. Turn on automatic artist notifications with Pro.',
    ctaLabel: 'Start Pro Trial',
    signature: 'jov.ie/you',
    ctaHref: PRO_SIGNUP_HREF,
  },
} as const satisfies ArtistNotificationsLandingCopy;
