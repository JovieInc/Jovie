export interface ArtistProfileMode {
  readonly id: 'listen' | 'pay' | 'tour' | 'contact';
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
    readonly headline: string;
    readonly subhead: string;
    readonly ctaLabel: string;
    readonly signature: string;
    readonly proofWhisper: string;
    readonly phoneCaption: string;
    readonly phoneSubcaption: string;
  };
  readonly adaptive: {
    readonly headline: string;
    readonly alternateHeadlines: readonly string[];
    readonly body: string;
    readonly contextCues: readonly [string, string, string, string];
    readonly restingScreenshotAlt: string;
    readonly restingScreenshotSrc: string;
    readonly modes: readonly ArtistProfileMode[];
  };
  readonly outcomes: {
    readonly headline: string;
    readonly body: string;
    readonly cards: readonly ArtistProfileOutcomeCard[];
    readonly syntheticProofs: ArtistProfileOutcomeProof;
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
  readonly capture: {
    readonly headline: string;
    readonly subhead: string;
    readonly body: string;
    readonly action: {
      readonly title: string;
      readonly detail: string;
      readonly ctaLabel: string;
      readonly confirmedLabel: string;
    };
    readonly notification: {
      readonly appName: string;
      readonly timeLabel: string;
      readonly title: string;
      readonly detail: string;
    };
    readonly audienceRails: readonly (readonly ArtistProfileAudiencePill[])[];
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
    headline: 'Built for every mode.',
    alternateHeadlines: [
      'One profile for every release moment.',
      'One link, tuned to what matters right now.',
      'The same link, different job.',
    ],
    body: 'One profile can flex from release push to ticket sales to fan capture.',
    contextCues: [
      'Source-aware',
      'Location-aware',
      'Device-aware',
      'Intent-aware',
    ],
    restingScreenshotAlt:
      "Jovie artist profile showing Tim White's live profile view.",
    restingScreenshotSrc:
      '/product-screenshots/tim-white-profile-live-phone.png',
    modes: [
      {
        id: 'listen',
        label: 'Drive Streams',
        headline: 'Keep the latest music one tap away.',
        description: 'Keep the latest music one tap away.',
        pathLabel: 'jov.ie/you/listen',
        drawer: {
          title: 'Listen',
          subtitle: 'The latest release stays front and center.',
          ctaLabel: 'Open release page',
          items: [
            {
              id: 'spotify',
              label: 'Spotify',
              detail: 'Best for Jason in LA',
              action: 'Play',
            },
            {
              id: 'apple-music',
              label: 'Apple Music',
              detail: 'Saved by returning fans',
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
        screenshotSrc:
          '/product-screenshots/tim-white-profile-listen-phone.png',
        screenshotAlt: 'Jovie artist profile showing a listen-first view.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'tour',
        label: 'Sell Out',
        headline: 'Surface the right dates and ticket paths.',
        description: 'Surface the right dates and ticket paths.',
        pathLabel: 'jov.ie/you/tour',
        drawer: {
          title: 'Tour dates',
          subtitle: 'Nearby dates rise to the top.',
          ctaLabel: 'View all dates',
          items: [
            {
              id: 'la',
              label: 'Los Angeles',
              detail: 'May 18 - The Novo',
              action: 'Tickets',
            },
            {
              id: 'chicago',
              label: 'Chicago',
              detail: 'May 24 - Radius',
              action: 'Tickets',
            },
            {
              id: 'new-york',
              label: 'New York',
              detail: 'Jun 02 - Brooklyn Mirage',
              action: 'Tickets',
            },
            {
              id: 'london',
              label: 'London',
              detail: 'Jun 14 - O2 Academy',
              action: 'Tickets',
            },
            {
              id: 'berlin',
              label: 'Berlin',
              detail: 'Jun 21 - Astra Kulturhaus',
              action: 'Tickets',
            },
          ],
        },
        screenshotSrc: '/product-screenshots/tim-white-profile-tour-phone.png',
        screenshotAlt:
          'Jovie artist profile showing nearby shows and ticket paths.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'pay',
        label: 'Get Paid',
        headline: 'Make support one tap away.',
        description: 'Make support one tap away.',
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
        screenshotSrc: '/product-screenshots/tim-white-profile-pay-phone.png',
        screenshotAlt: 'Jovie artist profile showing direct support options.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'contact',
        label: 'Contact',
        headline: 'Keep booking, management, and press one tap away.',
        description: 'Keep booking, management, and press one tap away.',
        pathLabel: 'jov.ie/you/contact',
        drawer: {
          title: 'Contact',
          subtitle: 'Booking, management, and press in one place.',
          ctaLabel: 'Email team',
          items: [
            {
              id: 'booking',
              label: 'Booking',
              detail: 'North America + Europe',
              action: 'Email',
            },
            {
              id: 'management',
              label: 'Management',
              detail: 'Worldwide',
              action: 'Email',
            },
            {
              id: 'press',
              label: 'Press',
              detail: 'US + UK',
              action: 'Email',
            },
            {
              id: 'brands',
              label: 'Brands',
              detail: 'Partnerships',
              action: 'Email',
            },
          ],
        },
        screenshotSrc:
          '/product-screenshots/tim-white-profile-contact-phone.png',
        screenshotAlt:
          'Jovie artist profile showing contact access for booking and press.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
    ],
  },
  outcomes: {
    headline: 'Built for Artists.',
    body: 'Every detail is tuned to move the next tap forward.',
    cards: [
      {
        id: 'drive-streams',
        title: 'Drive streams',
        description:
          'Put the latest release, pre-save, or countdown at the front of the profile.',
      },
      {
        id: 'sell-out',
        title: 'Sell out',
        description:
          'Surface the right show moment with saved dates, nearby venues, and ticket intent.',
      },
      {
        id: 'get-paid',
        title: 'Get paid',
        description: 'Make direct support feel native to the artist profile.',
      },
      {
        id: 'share-anywhere',
        title: 'Share anywhere',
        description:
          'Use one clean profile link across bio, QR, posts, stories, and shows.',
      },
    ],
    syntheticProofs: {
      visualProofs: {
        driveStreams: {
          liveScreenshotSrc:
            '/product-screenshots/tim-white-profile-live-phone.png',
          liveScreenshotAlt:
            'Jovie artist profile showing Tim White with the latest release live.',
          presaveScreenshotSrc:
            '/product-screenshots/release-deep-end-phone.png',
          presaveScreenshotAlt:
            'Jovie release page showing The Deep End countdown card.',
          title: 'The Deep End',
          artistName: 'Cosmic Gate & Tim White',
          liveLabel: 'Out now',
          presaveLabel: 'Countdown live',
        },
        sellOut: {
          screenshotSrc:
            '/product-screenshots/tim-white-profile-tour-phone.png',
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
          screenshotSrc: '/product-screenshots/tim-white-profile-pay-phone.png',
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
  capture: {
    headline: 'Build the list. Keep it working.',
    subhead:
      'Every visit is a chance to add a fan. Every fan gets reached automatically for the next drop.',
    body: 'New fans opt in from every profile visit, QR scan, and link click. Jovie notifies them for every release, show, and update — so your audience grows without starting over each time.',
    action: {
      title: 'Get updates',
      detail: 'Release and show alerts.',
      ctaLabel: 'Subscribe',
      confirmedLabel: 'Notifications Enabled',
    },
    notification: {
      appName: 'Jovie',
      timeLabel: 'now',
      title: 'Notifications Enabled',
      detail: 'Next release goes out automatically.',
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
    headline: 'Details that matter.',
    subhead:
      'Built from 15 years of music marketing experience, obsessing over the details that make a profile convert.',
  },
  howItWorks: {
    headline: 'Live in 60 seconds.',
    body: 'Search once, go live fast, and share the same profile everywhere.',
    steps: [
      {
        id: 'claim',
        title: 'Claim',
        description: 'Find your artist.',
      },
      {
        id: 'connect',
        title: 'Sync',
        description: 'Pull your catalog in.',
      },
      {
        id: 'share',
        title: 'Share',
        description: 'Use the same link everywhere.',
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
      artistName: 'Tim White',
      startProgress: 0,
      endProgress: 86,
      otherProvidersLabel: 'And 24 others.',
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
    headline: 'Real Artists. Real Workflows.',
    intro: 'Real artist profiles built around real release moments.',
  },
  faq: {
    headline: 'Frequently Asked Questions',
    items: [
      {
        question: 'How is Jovie different from Linktree?',
        answer:
          'Linktree is a general-purpose link list. Jovie is a music profile that understands releases, shows, pay, fan capture, and the actions artists need fans to take.',
      },
      {
        question: 'How is it different from a smart link or pre-save page?',
        answer:
          'A smart link or pre-save page usually serves one campaign. Jovie gives the artist one profile that can route to music, shows, pay, subscribe, releases, and future fan actions.',
      },
      {
        question: 'Can I deep-link to specific modes like shows or pay?',
        answer:
          'Yes. You can send fans straight to modes like music, shows, pay, subscribe, and more without asking them to hunt through the full profile.',
      },
      {
        question: 'Do I need to design or customize anything?',
        answer:
          'No. Jovie is polished by default. You claim it, connect once, and the page is built around your identity and content without theme work.',
      },
      {
        question: 'What can fans do from one profile?',
        answer:
          'Fans can listen, find shows, buy tickets, pay or support, subscribe, scan QR codes, and opt in so you can reach them again.',
      },
      {
        question: 'How long does setup take?',
        answer:
          'Jovie imports your whole catalog, matches it across 27+ providers, and builds a live always up-to-date profile in 60 seconds.',
      },
    ],
  },
  finalCta: {
    headline: "Don't lose your next fan.",
    subhead: 'Turn every visit into a stream, save, signup, or support.',
    ctaLabel: 'Claim your profile',
    signature: 'jov.ie/you',
  },
} as const;
