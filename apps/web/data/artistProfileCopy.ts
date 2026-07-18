import { getMarketingExportImage } from '@/lib/screenshots/registry';

export interface ArtistProfileMode {
  readonly id:
    | 'listen'
    | 'pay'
    | 'tour'
    | 'contact'
    | 'upcoming-release'
    | 'release-day'
    | 'touring'
    | 'live-support';
  readonly label: string;
  readonly headline: string;
  readonly description: string;
  readonly pathLabel: string;
  readonly drawer: ArtistProfileModeDrawer;
  readonly screenshotSrc: string;
  readonly screenshotAlt: string;
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
}

export interface ArtistProfileModeDrawer {
  readonly title: string;
  readonly subtitle: string;
  readonly ctaLabel: string;
  readonly items: readonly ArtistProfileModeDrawerItem[];
}

export interface ArtistProfileModeDrawerItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly action: string;
}

export interface ArtistProfileOutcomeCard {
  readonly id: 'drive-streams' | 'sell-out' | 'get-paid' | 'share-anywhere';
  readonly title: string;
  readonly description: string;
}

export interface ArtistProfileLandingOutcomeCard {
  readonly id:
    | 'straight-to-listen'
    | 'local-dates-first'
    | 'support-without-friction'
    | 'capture-the-fan'
    | 'one-link-everywhere';
  readonly title: string;
  readonly description: string;
}

export interface ArtistProfileOutcomeProof {
  readonly visualProofs: {
    readonly driveStreams: {
      readonly liveScreenshotSrc: string;
      readonly liveScreenshotAlt: string;
      readonly presaveScreenshotSrc: string;
      readonly presaveScreenshotAlt: string;
      readonly title: string;
      readonly artistName: string;
      readonly liveLabel: string;
      readonly presaveLabel: string;
    };
    readonly sellOut: {
      readonly screenshotSrc: string;
      readonly screenshotAlt: string;
      readonly nearbyCardLabel: string;
      readonly nearbyDate: string;
      readonly nearbyVenue: string;
      readonly nearbyLocation: string;
      readonly nearbyCtaLabel: string;
      readonly drawerTitle: string;
      readonly drawerSubtitle: string;
      readonly drawerRows: readonly {
        readonly id: string;
        readonly month: string;
        readonly day: string;
        readonly venue: string;
        readonly location: string;
        readonly ctaLabel: string;
      }[];
    };
    readonly getPaid: {
      readonly screenshotSrc: string;
      readonly screenshotAlt: string;
      readonly drawerTitle: string;
      readonly drawerSubtitle: string;
      readonly chooseAmountLabel: string;
      readonly amountRows: readonly {
        readonly id: string;
        readonly amount: string;
        readonly currency: string;
        readonly featured?: boolean;
      }[];
      readonly ctaLabel: string;
    };
  };
  readonly shareAnywhere: {
    readonly url: string;
    readonly title: string;
    readonly subtitle: string;
  };
  readonly captureFan: {
    readonly inputLabel: string;
    readonly inputValue: string;
    readonly ctaLabel: string;
    readonly confirmedLabel: string;
    readonly followUpLabel: string;
  };
}

export interface ArtistProfileHowItWorksStep {
  readonly id: 'claim' | 'connect' | 'share';
  readonly title: string;
  readonly description: string;
}

export interface ArtistProfileFaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface ArtistProfileAudiencePill {
  readonly id: string;
  readonly icon:
    | 'spotify'
    | 'apple'
    | 'youtube'
    | 'qr'
    | 'shows'
    | 'subscribe'
    | 'music'
    | 'email'
    | 'pay';
  readonly sentence: string;
}

export interface ArtistProfileLandingCopy {
  readonly seo: {
    readonly title: string;
    readonly description: string;
    readonly keywords: readonly string[];
  };
  readonly hero: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly subhead: string;
    readonly ctaLabel: string;
    readonly signature: string;
    readonly proofWhisper: string;
    readonly phoneCaption: string;
    readonly phoneSubcaption: string;
  };
  readonly adaptive: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly alternateHeadlines: readonly string[];
    readonly body: string;
    readonly contextCues: readonly [string, string, string, string];
    readonly productLabel: string;
    readonly productDetail: string;
    readonly restingScreenshotAlt: string;
    readonly restingScreenshotSrc: string;
    readonly modes: readonly ArtistProfileMode[];
  };
  readonly outcomes: {
    readonly headline: string;
    readonly body: string;
    readonly cards: readonly ArtistProfileOutcomeCard[];
    readonly landingCards: readonly ArtistProfileLandingOutcomeCard[];
    readonly syntheticProofs: ArtistProfileOutcomeProof;
  };
  readonly opinionated: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly body: string;
    readonly principle: string;
    readonly columns: readonly [string, string, string];
    readonly decisions: readonly {
      readonly id: 'release' | 'tour' | 'support';
      readonly context: string;
      readonly signal: string;
      readonly action: string;
    }[];
  };
  readonly outcomeDuo: {
    readonly marketingHeadline: string;
    readonly homepageHeadline: string;
    readonly cards: {
      readonly getPaid: {
        readonly label: string;
        readonly drawerTitle: string;
        readonly amountRows: readonly {
          readonly id: string;
          readonly amount: string;
          readonly currency: string;
          readonly featured?: boolean;
        }[];
        readonly ctaLabel: string;
      };
      readonly sellOut: {
        readonly label: string;
        readonly drawerTitle: string;
        readonly drawerRows: readonly {
          readonly id: string;
          readonly month: string;
          readonly day: string;
          readonly venue: string;
          readonly location: string;
          readonly ctaLabel: string;
        }[];
      };
    };
  };
  readonly monetization: {
    readonly headline: string;
    readonly subhead: string;
    readonly irlPaymentsCard: {
      readonly textAnchor: 'top';
      readonly title: string;
      readonly body: string;
      readonly visualSide: 'right';
      readonly contextLabel: string;
      readonly contextDetail: string;
      readonly amountLabel: string;
      readonly amounts: readonly [
        {
          readonly id: 'five';
          readonly amount: string;
        },
        {
          readonly id: 'ten';
          readonly amount: string;
          readonly featured: true;
        },
        {
          readonly id: 'twenty';
          readonly amount: string;
        },
      ];
    };
    readonly captureCard: {
      readonly textAnchor: 'bottom';
      readonly title: string;
      readonly body: string;
      readonly fanName: string;
      readonly fanLocation: string;
      readonly fanAmount: string;
      readonly fanIntent: string;
      readonly visualSide: 'left';
    };
    readonly thanksCard: {
      readonly textAnchor: 'top';
      readonly title: string;
      readonly body: string;
      readonly appName: string;
      readonly sender: string;
      readonly visualSide: 'right';
      readonly notificationTitle: string;
      readonly notificationPreview: string;
    };
    readonly reengageCard: {
      readonly textAnchor: 'bottom';
      readonly title: string;
      readonly body: string;
      readonly visualSide: 'left';
      readonly outputs: readonly [
        {
          readonly id: 'payment';
          readonly title: string;
          readonly detail: string;
        },
        {
          readonly id: 'thanks';
          readonly title: string;
          readonly detail: string;
        },
        {
          readonly id: 'spotify';
          readonly title: string;
          readonly detail: string;
        },
      ];
    };
  };
  readonly payFlowVideo: {
    readonly headline: string;
    readonly subhead: string;
    readonly ariaLabel: string;
    readonly posterAlt: string;
    readonly playLabel: string;
  };
  readonly capture: {
    readonly headline: string;
    readonly subhead: string;
    readonly body: string;
    readonly action: {
      readonly title: string;
      readonly detail: string;
      readonly inputPlaceholder: string;
      readonly ctaLabel: string;
      readonly confirmedLabel: string;
    };
    readonly notification: {
      readonly appName: string;
      readonly timeLabel: string;
      readonly title: string;
      readonly detail: string;
    };
    readonly journey: {
      readonly inputEyebrow: string;
      readonly inputPreviewLabel: string;
      readonly notificationEyebrow: string;
      readonly notificationHeadline: string;
      readonly notificationBody: string;
    };
    readonly audienceRails: readonly (readonly ArtistProfileAudiencePill[])[];
    readonly benefits: readonly {
      readonly id: 'opt-in' | 'alerts' | 'ownership';
      readonly label: string;
      readonly detail: string;
    }[];
  };
  readonly reactivation: {
    readonly headline: string;
    readonly subhead: string;
    readonly workflow: {
      readonly columns: readonly [
        'Trigger',
        'Audience',
        'Message',
        'Destination',
      ];
      readonly rows: readonly {
        readonly id: 'release' | 'tour' | 'video' | 'support-follow-up';
        readonly trigger: string;
        readonly audience: string;
        readonly message: string;
        readonly destination: string;
      }[];
    };
    readonly outputs: readonly {
      readonly id: 'release-alerts' | 'nearby-show-alerts' | 'thank-you';
      readonly label: string;
      readonly title: string;
      readonly detail: string;
      readonly destination: string;
    }[];
  };
  readonly specWall: {
    readonly headline: string;
    readonly subhead: string;
  };
  readonly howItWorks: {
    readonly headline: string;
    readonly body: string;
    readonly steps: readonly ArtistProfileHowItWorksStep[];
    readonly claim: {
      readonly searchValue: string;
      readonly resultName: string;
      readonly resultSubtitle: string;
      readonly profilePath: string;
      readonly ctaLabel: string;
    };
    readonly sync: {
      readonly title: string;
      readonly detail: string;
      readonly artistName: string;
      readonly startProgress: number;
      readonly endProgress: number;
      readonly otherProvidersLabel: string;
      readonly providers: readonly {
        readonly provider: 'spotify' | 'apple_music' | 'deezer';
        readonly status: 'Matched' | 'Ingesting';
      }[];
    };
    readonly share: {
      readonly url: string;
      readonly displayValue: string;
      readonly qrLabel: string;
      readonly deepLinksLabel: string;
      readonly deepLinks: readonly [string, string, string, string];
    };
  };
  readonly socialProof: {
    readonly headline: string;
    readonly intro: string;
  };
  readonly faq: {
    readonly headline: string;
    readonly items: readonly ArtistProfileFaqItem[];
  };
  readonly finalCta: {
    readonly headline: string;
    readonly subhead: string;
    readonly ctaLabel: string;
    readonly signature: string;
  };
}

/**
 * The animated audience visual is also used by the notifications landing page.
 * Keep its contract limited to the fields that visual actually renders so the
 * artist-profile narrative can evolve without forcing unrelated page copy.
 */
export type ArtistProfileCaptureVisualCopy = Omit<
  ArtistProfileLandingCopy['capture'],
  'action' | 'benefits' | 'journey'
> & {
  readonly action: Omit<
    ArtistProfileLandingCopy['capture']['action'],
    'inputPlaceholder'
  >;
};

export const ARTIST_PROFILE_COPY: ArtistProfileLandingCopy = {
  seo: {
    title: 'Artist Profiles',
    description:
      'Claim your free artist profile on Jovie. One link that adapts to every release, show, and fan moment.',
    keywords: [
      'artist profile',
      'link in bio for musicians',
      'music smart links',
      'artist landing page',
      'linktree alternative for artists',
      'music link in bio',
      'artist bio page',
    ],
  },
  hero: {
    eyebrow: 'Built for artists',
    headline: 'The link your music deserves.',
    subhead:
      'Streams, drops, support, bookings, and fan capture in a single page.',
    ctaLabel: 'Claim your profile',
    signature: 'jov.ie/you',
    proofWhisper: 'Used by artists on',
    phoneCaption: 'One profile.',
    phoneSubcaption: 'Adapts to every fan.',
  },
  adaptive: {
    eyebrow: 'Adaptive by default',
    headline: 'One profile that adapts to every fan.',
    alternateHeadlines: [
      'One profile for every release moment.',
      'One link, tuned to what matters right now.',
      'The same link, different job.',
    ],
    body: 'Before a drop, it becomes a countdown. On release day, it routes fans straight to the right service. On tour, nearby dates come first. At the merch table, one scan can become support and fan capture.',
    contextCues: [
      'Release-aware',
      'Location-aware',
      'Service-aware',
      'Moment-aware',
    ],
    productLabel: 'Same profile',
    productDetail: 'Different job, exactly when it matters.',
    restingScreenshotAlt:
      "Jovie artist profile showing Tim White's live profile view.",
    restingScreenshotSrc: getMarketingExportImage(
      'tim-white-profile-live-mobile'
    ).publicUrl,
    modes: [
      {
        id: 'upcoming-release',
        label: 'Upcoming Release',
        headline: 'Before a drop, your profile becomes a countdown.',
        description: 'Before a drop, your profile becomes a countdown.',
        pathLabel: 'jov.ie/you',
        drawer: {
          title: 'The Deep End',
          subtitle: 'New release arriving soon.',
          ctaLabel: 'Pre-save release',
          items: [
            {
              id: 'countdown',
              label: 'Release countdown',
              detail: '02 days · 14 hours',
              action: 'Live',
            },
            {
              id: 'presave',
              label: 'Pre-save',
              detail: 'Spotify + Apple Music',
              action: 'Save',
            },
            {
              id: 'notify',
              label: 'Release alert',
              detail: 'Get notified when it drops',
              action: 'Notify me',
            },
          ],
        },
        screenshotSrc: getMarketingExportImage(
          'tim-white-profile-presave-mobile'
        ).publicUrl,
        screenshotAlt:
          'Jovie artist profile showing an upcoming release and pre-save state.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'release-day',
        label: 'Release Day',
        headline:
          'When the song is live, fans go straight to the right service.',
        description:
          'When the song is live, fans go straight to the right service.',
        pathLabel: 'jov.ie/you/listen',
        drawer: {
          title: 'Listen',
          subtitle: 'The latest release stays front and center.',
          ctaLabel: 'Open release page',
          items: [
            {
              id: 'spotify',
              label: 'Spotify',
              detail: 'Best for this listener',
              action: 'Play',
            },
            {
              id: 'apple-music',
              label: 'Apple Music',
              detail: 'Open in the native app',
              action: 'Open',
            },
            {
              id: 'youtube',
              label: 'YouTube',
              detail: 'Watch the latest video',
              action: 'Watch',
            },
          ],
        },
        screenshotSrc: getMarketingExportImage(
          'tim-white-profile-listen-mobile'
        ).publicUrl,
        screenshotAlt:
          'Jovie artist profile showing a release-day listen view.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'touring',
        label: 'Touring',
        headline: "When you're on the road, nearby dates come first.",
        description: "When you're on the road, nearby dates come first.",
        pathLabel: 'jov.ie/you/tour',
        drawer: {
          title: 'Tour dates',
          subtitle: 'Nearby dates rise to the top.',
          ctaLabel: 'View all dates',
          items: [
            {
              id: 'la',
              label: 'Los Angeles',
              detail: 'May 18 · The Novo',
              action: 'Tickets',
            },
            {
              id: 'chicago',
              label: 'Chicago',
              detail: 'May 24 · Radius',
              action: 'Tickets',
            },
            {
              id: 'new-york',
              label: 'New York',
              detail: 'Jun 02 · Brooklyn Mirage',
              action: 'Tickets',
            },
          ],
        },
        screenshotSrc: getMarketingExportImage('tim-white-profile-tour-mobile')
          .publicUrl,
        screenshotAlt:
          'Jovie artist profile showing nearby shows and ticket paths.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'live-support',
        label: 'Live Support',
        headline: 'At the merch table, one scan becomes support and capture.',
        description:
          'At the merch table, one scan becomes support and capture.',
        pathLabel: 'jov.ie/you/pay',
        drawer: {
          title: 'Support',
          subtitle: 'Choose an amount.',
          ctaLabel: 'Continue with Venmo',
          items: [
            {
              id: 'five',
              label: '$5',
              detail: 'Quick support',
              action: 'USD',
            },
            {
              id: 'ten',
              label: '$10',
              detail: 'Most common',
              action: 'USD',
            },
            {
              id: 'twenty',
              label: '$20',
              detail: 'Top fan',
              action: 'USD',
            },
          ],
        },
        screenshotSrc: getMarketingExportImage('tim-white-profile-pay-mobile')
          .publicUrl,
        screenshotAlt: 'Jovie artist profile showing direct support options.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
    ],
  },
  outcomes: {
    headline: 'Built around fan outcomes.',
    body: 'Every state of the profile is designed to reduce friction and move the fan to the next right action.',
    cards: [
      {
        id: 'drive-streams',
        title: 'Drive Streams',
        description:
          'Put the latest release, pre-save, or countdown at the front of the profile.',
      },
      {
        id: 'sell-out',
        title: 'Sell Out',
        description:
          'Surface the right show moment with saved dates, nearby venues, and ticket intent.',
      },
      {
        id: 'get-paid',
        title: 'Get Paid',
        description: 'Make direct support feel native to the artist profile.',
      },
      {
        id: 'share-anywhere',
        title: 'Share Anywhere',
        description:
          'Use one clean profile link across bio, QR, posts, stories, and shows.',
      },
    ],
    landingCards: [
      {
        id: 'straight-to-listen',
        title: 'Straight to listen',
        description:
          'Fans land on the right release and the right platform without hunting through a stack of links.',
      },
      {
        id: 'local-dates-first',
        title: 'Local dates first',
        description:
          'Touring fans see the show that matters to them instead of scrolling through cities that do not.',
      },
      {
        id: 'support-without-friction',
        title: 'Support without friction',
        description:
          'When someone is ready to support, the profile turns that moment into action fast.',
      },
      {
        id: 'capture-the-fan',
        title: 'Capture the fan',
        description:
          'A listen, a signup, or a support moment can become a real fan relationship instead of an anonymous click.',
      },
      {
        id: 'one-link-everywhere',
        title: 'Keep one link everywhere',
        description:
          'Bio, story, flyer, QR code, and release post all point to the same profile.',
      },
    ],
    syntheticProofs: {
      visualProofs: {
        driveStreams: {
          liveScreenshotSrc: getMarketingExportImage(
            'tim-white-profile-live-mobile'
          ).publicUrl,
          liveScreenshotAlt:
            'Jovie artist profile showing Tim White with the latest release live.',
          presaveScreenshotSrc: getMarketingExportImage(
            'release-presave-mobile'
          ).publicUrl,
          presaveScreenshotAlt:
            'Jovie release page showing The Deep End countdown card.',
          title: 'The Deep End',
          artistName: 'Cosmic Gate & Tim White',
          liveLabel: 'Out now',
          presaveLabel: 'Countdown live',
        },
        sellOut: {
          screenshotSrc: getMarketingExportImage(
            'tim-white-profile-tour-mobile'
          ).publicUrl,
          screenshotAlt:
            'Jovie profile showing an open tour drawer with upcoming ticket dates.',
          nearbyCardLabel: 'Nearby date',
          nearbyDate: 'May 18',
          nearbyVenue: 'The Novo',
          nearbyLocation: 'Los Angeles, CA, US',
          nearbyCtaLabel: 'Tickets',
          drawerTitle: 'Tour Dates',
          drawerSubtitle: 'Upcoming shows and ticket links.',
          drawerRows: [
            {
              id: 'los-angeles',
              month: 'May',
              day: '18',
              venue: 'The Novo',
              location: 'Los Angeles, CA, US',
              ctaLabel: 'Tickets',
            },
            {
              id: 'chicago',
              month: 'May',
              day: '24',
              venue: 'Radius',
              location: 'Chicago, IL, US',
              ctaLabel: 'Tickets',
            },
          ],
        },
        getPaid: {
          screenshotSrc: getMarketingExportImage('tim-white-profile-pay-mobile')
            .publicUrl,
          screenshotAlt:
            'Jovie profile showing an open support drawer with payment amounts.',
          drawerTitle: 'Pay',
          drawerSubtitle: 'Send support instantly with Venmo.',
          chooseAmountLabel: 'Choose amount',
          amountRows: [
            {
              id: 'five',
              amount: '$5',
              currency: 'USD',
            },
            {
              id: 'ten',
              amount: '$10',
              currency: 'USD',
              featured: true,
            },
            {
              id: 'twenty',
              amount: '$20',
              currency: 'USD',
            },
          ],
          ctaLabel: 'Continue with Venmo',
        },
      },
      shareAnywhere: {
        url: 'jov.ie/tim',
        title: 'Share-ready',
        subtitle: 'Bio, QR, stories, and shows.',
      },
      captureFan: {
        inputLabel: 'Email address',
        inputValue: 'fan@example.com',
        ctaLabel: 'Get updates',
        confirmedLabel: 'Fan captured',
        followUpLabel: 'Release alerts enabled',
      },
    },
  },
  opinionated: {
    eyebrow: 'Opinionated by design',
    headline: 'Built to convert, not decorate.',
    body: 'Jovie is intentionally constrained. No theme builder. No layout rabbit hole. No generic creator-site sprawl. Every profile teaches fans what to tap because the product is built around release moments, show moments, and conversion.',
    principle: 'No template maze.',
    columns: ['Moment', 'Jovie reads', 'Primary action'],
    decisions: [
      {
        id: 'release',
        context: 'Release is live',
        signal: 'Latest music',
        action: 'Listen',
      },
      {
        id: 'tour',
        context: 'Fan is nearby',
        signal: 'Local date',
        action: 'Tickets',
      },
      {
        id: 'support',
        context: 'Merch-table scan',
        signal: 'Live moment',
        action: 'Support',
      },
    ],
  },
  outcomeDuo: {
    // Two headlines by design: the /artist-profile page and the homepage
    // render the same duo cards but are expected to diverge in voice over time.
    // Keep both keys even when strings match so the seam stays visible.
    marketingHeadline: 'Artist Profiles. Built to convert.',
    homepageHeadline: 'Artist Profiles. Built to convert.',
    cards: {
      getPaid: {
        label: 'Get Paid',
        drawerTitle: 'Pay',
        amountRows: [
          { id: 'five', amount: '$5', currency: 'USD' },
          { id: 'ten', amount: '$10', currency: 'USD', featured: true },
          { id: 'twenty', amount: '$20', currency: 'USD' },
        ],
        ctaLabel: 'Continue with Venmo',
      },
      sellOut: {
        label: 'Sell Out',
        drawerTitle: 'Tour Dates',
        drawerRows: [
          {
            id: 'los-angeles',
            month: 'May',
            day: '18',
            venue: 'The Novo',
            location: 'Los Angeles, CA',
            ctaLabel: 'Tickets',
          },
          {
            id: 'chicago',
            month: 'May',
            day: '24',
            venue: 'Radius',
            location: 'Chicago, IL',
            ctaLabel: 'Tickets',
          },
          {
            id: 'brooklyn',
            month: 'Jun',
            day: '07',
            venue: 'Brooklyn Steel',
            location: 'Brooklyn, NY',
            ctaLabel: 'Tickets',
          },
          {
            id: 'metro',
            month: 'Jun',
            day: '14',
            venue: 'Metro',
            location: 'Chicago, IL',
            ctaLabel: 'Tickets',
          },
        ],
      },
    },
  },
  monetization: {
    headline: 'Get paid. Again and again.',
    subhead: 'Turn a $10 busking tip into a lifelong customer.',
    irlPaymentsCard: {
      textAnchor: 'top',
      title: 'Accept payments',
      body: 'A sidewalk scan should feel instant, native, and ready to close the tip.',
      visualSide: 'right',
      contextLabel: 'Busking QR',
      contextDetail: 'Scan to support',
      amountLabel: 'Choose amount',
      amounts: [
        {
          id: 'five',
          amount: '$5',
        },
        {
          id: 'ten',
          amount: '$10',
          featured: true,
        },
        {
          id: 'twenty',
          amount: '$20',
        },
      ],
    },
    captureCard: {
      textAnchor: 'bottom',
      title: 'Capture the fan',
      body: 'A cashless street payment should become a reachable fan, not a dead-end receipt.',
      fanName: 'Jessica',
      fanLocation: 'Los Angeles',
      fanAmount: '$10',
      fanIntent: 'Sidewalk QR tip',
      visualSide: 'left',
    },
    thanksCard: {
      textAnchor: 'top',
      title: 'Say thanks',
      body: 'One clean thank-you can feel personal and send the fan straight back to the music.',
      appName: 'Jovie',
      sender: 'Jovie for Tim White',
      visualSide: 'right',
      notificationTitle: "Thanks for the payment. Here's the new song.",
      notificationPreview:
        'A quick thank-you with the latest release, sent right after the tip.',
    },
    reengageCard: {
      textAnchor: 'bottom',
      title: 'Re-engage every release',
      body: 'One payment can turn into a fan who comes back again and again.',
      visualSide: 'left',
      outputs: [
        {
          id: 'payment',
          title: 'Jessica paid you $10',
          detail: 'From busking QR code',
        },
        {
          id: 'thanks',
          title: 'Thanks email sent',
          detail: 'With the latest release',
        },
        {
          id: 'spotify',
          title: 'Fan activity',
          detail: 'Clicked through to Spotify',
        },
      ],
    },
  },
  payFlowVideo: {
    headline: 'One scan. A fan for life.',
    subhead: 'Watch a $10 sidewalk tip turn into a fan you can reach again.',
    ariaLabel:
      'Short looping video of a fan scanning an artist QR code, paying $10 with Apple Pay, and the artist receiving a thank-you notification.',
    posterAlt:
      'Artist profile open on an iPhone, ready for a fan to send a tip.',
    playLabel: 'Play pay flow',
  },
  capture: {
    headline: 'Capture every fan, not just the click.',
    subhead: 'One opt-in can become a lasting fan relationship.',
    body: 'Fans opt in once. From there, Jovie can keep them close with release alerts and future follow-up. The profile is not just a destination. It is the start of an owned audience.',
    action: {
      title: 'Get updates',
      detail: 'Release and nearby-show alerts.',
      inputPlaceholder: 'Email or phone',
      ctaLabel: 'Get updates',
      confirmedLabel: 'You’re on the list',
    },
    notification: {
      appName: 'Jovie',
      timeLabel: 'now',
      title: 'The Deep End is out now',
      detail: 'Listen on your favorite service.',
    },
    journey: {
      inputEyebrow: 'Fan action',
      inputPreviewLabel:
        'Example fan opt-in with an email or phone field and a confirmed subscription state.',
      notificationEyebrow: 'The next right moment',
      notificationHeadline: 'Timely, not noisy.',
      notificationBody:
        'The fan asked to hear from you. Jovie keeps that promise when there is something worth opening.',
    },
    audienceRails: [
      [
        {
          id: 'spotify-jason-la',
          icon: 'spotify',
          sentence: 'Ava L. in London saved O2 Arena.',
        },
        {
          id: 'email-brian',
          icon: 'email',
          sentence: 'Marcus T. in Chicago opened the LA show.',
        },
        {
          id: 'shows-london-o2',
          icon: 'shows',
          sentence: 'Mika B. in Berlin scanned the New York show flyer.',
        },
        {
          id: 'qr-berlin-flyer',
          icon: 'qr',
          sentence: 'Nina P. turned on new music notifications.',
        },
      ],
      [
        {
          id: 'apple-tokyo',
          icon: 'apple',
          sentence: 'Jason R. in Toronto opened the release page.',
        },
        {
          id: 'youtube-sao-paulo',
          icon: 'youtube',
          sentence: 'Luana P. in Sao Paulo watched on YouTube.',
        },
        {
          id: 'subscribe-maya-notifications',
          icon: 'subscribe',
          sentence: 'Maya S. turned on release notifications.',
        },
        {
          id: 'spotify-amelia-london',
          icon: 'spotify',
          sentence: 'Amelia D. in London opened Spotify.',
        },
      ],
      [
        {
          id: 'shows-chicago',
          icon: 'shows',
          sentence: 'Diego F. in Austin saved the show.',
        },
        {
          id: 'qr-miami-sticker',
          icon: 'qr',
          sentence: 'Sofia K. in Miami scanned the sticker.',
        },
        {
          id: 'email-nina',
          icon: 'email',
          sentence: 'Nina P. confirmed the email opt-in.',
        },
        {
          id: 'pay-diego-support',
          icon: 'pay',
          sentence: 'Diego F. paid from the sidewalk QR.',
        },
      ],
    ],
    benefits: [
      {
        id: 'opt-in',
        label: 'Opt in once',
        detail: 'A simple fan action starts the relationship.',
      },
      {
        id: 'alerts',
        label: 'Reach the moment',
        detail: 'Release and nearby-show alerts arrive when they matter.',
      },
      {
        id: 'ownership',
        label: 'Keep the audience',
        detail: 'The relationship belongs to the artist, not the click.',
      },
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
          trigger: 'New music',
          audience: 'Fans who asked for music',
          message: 'New release alert',
          destination: 'Latest release page',
        },
      ],
    },
    outputs: [
      {
        id: 'release-alerts',
        label: 'Drive streams',
        title: 'Subscribers hear it first.',
        detail: 'New release live now',
        destination: 'Email -> release page',
      },
      {
        id: 'nearby-show-alerts',
        label: 'Move ticket intent',
        title: 'The right city gets the date.',
        detail: 'Los Angeles added · The Novo',
        destination: 'Alert -> ticket page',
      },
      {
        id: 'thank-you',
        label: 'Bring fans back',
        title: 'Support turns into the next listen.',
        detail: 'Thanks for the support tonight',
        destination: 'Message -> release page',
      },
    ],
  },
  specWall: {
    headline: 'Built for artists.',
    subhead:
      'The product truth behind one fast, music-native profile—kept compact on purpose.',
  },
  howItWorks: {
    headline: 'One link. Three steps.',
    body: 'Claim the profile, connect the essentials, and keep the same URL everywhere.',
    steps: [
      {
        id: 'claim',
        title: 'Claim your profile.',
        description: 'Start with your handle and get the core page live.',
      },
      {
        id: 'connect',
        title: 'Connect your music and links.',
        description:
          'Import the essentials so the profile reflects your real catalog and surfaces.',
      },
      {
        id: 'share',
        title: 'Share one link everywhere.',
        description:
          'Use the same profile in bio, stories, posts, QR, and release campaigns.',
      },
    ],
    claim: {
      searchValue: 'Tim White',
      resultName: 'Tim White',
      resultSubtitle: 'Spotify artist',
      profilePath: 'jov.ie/tim',
      ctaLabel: 'Claim',
    },
    sync: {
      title: 'Music connected',
      detail: 'Catalog and destinations matched.',
      artistName: 'Tim White',
      startProgress: 0,
      endProgress: 86,
      otherProvidersLabel: 'Your catalog stays connected.',
      providers: [
        {
          provider: 'spotify',
          status: 'Matched',
        },
        {
          provider: 'apple_music',
          status: 'Matched',
        },
        {
          provider: 'deezer',
          status: 'Ingesting',
        },
      ],
    },
    share: {
      url: 'https://jov.ie/tim',
      displayValue: 'jov.ie/tim',
      qrLabel: 'QR code',
      deepLinksLabel: 'Deep links',
      deepLinks: [
        'jov.ie/tim',
        'jov.ie/tim/pay',
        'jov.ie/tim/listen',
        'jov.ie/tim/contact',
      ],
    },
  },
  socialProof: {
    headline: 'Built for real artist workflows.',
    intro: 'Real artist profiles. Real release moments.',
  },
  faq: {
    headline: 'Questions, answered.',
    items: [
      {
        question: 'How is this different from Linktree?',
        answer:
          'Linktree is a general-purpose link page. Jovie is built for music release behavior: smart routing, release pages, show moments, support flows, fan capture, and notifications in one profile.',
      },
      {
        question: 'Can I use this before release day?',
        answer:
          'Yes. The profile can become a countdown or pre-release surface before the song is live, then switch behavior when release day arrives.',
      },
      {
        question: 'Can I use it for shows and support?',
        answer:
          'Yes. Touring, tickets, QR sharing, and support flows all fit inside the same profile instead of living on separate links.',
      },
      {
        question: 'How long does setup take?',
        answer:
          'Fast. Claim the profile, connect your music and links, and start sharing one URL.',
      },
    ],
  },
  finalCta: {
    headline: 'Claim your profile.',
    subhead: 'One link for every release, show, and fan action.',
    ctaLabel: 'Claim your profile',
    signature: 'jov.ie/you',
  },
} as const;
