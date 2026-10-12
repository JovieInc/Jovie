import type { Blocker } from './types';

/** Public Musicfetch docs service slugs. One coverage row, not a local pass per service. */
export const MUSICFETCH_DOCUMENTED_SERVICES = [
  'amazon',
  'amazon-music',
  'anghami',
  'apple-music',
  'audiomack',
  'audius',
  'awa',
  'bandcamp',
  'boomplay',
  'deezer',
  'flo',
  'gaana',
  'i-heart-radio',
  'jio-saavn',
  'joox',
  'kkbox',
  'line-music',
  'napster',
  'netease',
  'pandora',
  'qobuz',
  'qq-music',
  'seven-digital',
  'shazam',
  'soundcloud',
  'spotify',
  'tidal',
  'tiktok',
  'trebel',
  'yandex',
  'youtube',
  'youtube-music',
] as const;

export const MUSICFETCH_DOCS_URL = 'https://musicfetch.io/docs';
export const MUSICFETCH_TERMS_URL = 'https://musicfetch.io/terms';
export const CHARTMETRIC_DOCS_URL = 'https://apidocs.chartmetric.com/llms.txt';

/**
 * Musicfetch terms fetched 2026-10-08, section 2: integrated cache and display
 * inside the product is allowed. A substitutable aggregation or link-matching
 * service, and redistribution of API results as a standalone dataset, is not.
 * Live calls stay closed because the subscription is inactive (JOV-7323).
 */
export const MUSICFETCH_TERMS_REVIEWED_ON = '2026-10-08';

export const MUSICFETCH_LIVE_BLOCKER: Blocker = {
  failure:
    'MusicFetch returns 401 subscription not active. Do not renew the subscription or reactivate the trial.',
  owner: 'JOV-7323',
  reviewTrigger:
    'JOV-7323 records a non-renewal decision and the in-house resolver covers the call.',
};

export const MUSICFETCH_AGGREGATOR_BLOCKER: Blocker = {
  failure:
    'Musicfetch terms section 2 forbid a substitutable music-data aggregation or link-matching service and redistribution of API results as a standalone dataset.',
  owner: `Musicfetch terms reviewed ${MUSICFETCH_TERMS_REVIEWED_ON}`,
  reviewTrigger:
    'Terms change to permit a substitutable aggregator. This product still will not build one.',
};

export const CHARTMETRIC_ACCESS_BLOCKER: Blocker = {
  failure:
    'No Chartmetric refresh token is used here. This session must not call the paid API or spend credits.',
  owner: 'Chartmetric account owner (signup via hi@chartmetric.com)',
  reviewTrigger:
    'A server-side refresh token exists and a local behavioral test calls a shipped adapter without spending credits.',
};

export const CHARTMETRIC_SCORE_BLOCKER: Blocker = {
  failure:
    'Chartmetric Score is a vendor-owned opaque metric. This session does not copy or recompute it.',
  owner: 'Chartmetric',
  reviewTrigger:
    'A credentialed read is separately approved and the value is displayed as Chartmetric Score.',
};

export const SOCIALBLADE_ACCESS_BLOCKER: Blocker = {
  failure:
    'Social Blade Business API requires a client id and prepaid token. Do not call it, including zero-credit samples.',
  owner: 'Social Blade account owner',
  reviewTrigger:
    'A server-side client id and token exist and a local test exercises a shipped client without spending credits.',
};

export const SOCIALBLADE_OPAQUE_BLOCKER: Blocker = {
  failure:
    'Social Blade grade and sbrank are proprietary. The sbrank query is disabled and falls back. Do not copy the formula.',
  owner: 'Social Blade',
  reviewTrigger:
    'A licensed display of the vendor grade is explicitly approved.',
};

export const SOCIALBLADE_HISTORY_BLOCKER: Blocker = {
  failure:
    'Social Blade history archive and vault auto-downgrade when the requested depth is unavailable.',
  owner: 'Social Blade',
  reviewTrigger:
    'A credentialed statistics call returns an explicit history depth without auto-downgrade.',
};

export const SAME_NAME_LEASE_BLOCKER: Blocker = {
  failure:
    'Two same-name artists with no MusicBrainz id collapse on origin/main. Draft PR #20549 already groups that collision. Editing in-house.ts here would compete with the lease.',
  owner: 'JOV-7818',
  reviewTrigger:
    'PR #20549 merges, or the adopt worktree releases apps/web/lib/music-resolver/in-house.ts.',
  lease: {
    issue: 'JOV-7818',
    prs: [20549, 20552],
    files: ['apps/web/lib/music-resolver/in-house.ts'],
  },
};

export const CANONICAL_ASSERTION_BLOCKER: Blocker = {
  failure:
    'The canonical assertion store lives on the leased identity resolver. This session does not open a second store.',
  owner: 'JOV-7818',
  reviewTrigger: 'PR #20549 merges and the assertion fields land with it.',
  lease: {
    issue: 'JOV-7818',
    prs: [20549],
    files: [
      'apps/web/lib/music-resolver/in-house.ts',
      'apps/web/lib/music-resolver/in-house-contracts.ts',
    ],
  },
};

export const PUBLIC_CONTRACT_BLOCKER: Blocker = {
  failure:
    'The public CLI contract is already on draft PR #20552. This session does not open a second contract.',
  owner: 'JOV-7818',
  reviewTrigger: 'PR #20552 merges, or its owner releases the CLI files.',
  lease: {
    issue: 'JOV-7818',
    prs: [20552],
    files: ['packages/jovie-cli/src/commands.ts'],
  },
};

export const FRESHNESS_BLOCKER: Blocker = {
  failure:
    'Freshness and shared cost controls need a vendor credential. A key without a local behavioral test is not a pass, and this session does not call vendors.',
  owner: 'Chartmetric and MusicFetch credential owners',
  reviewTrigger:
    'A credentialed adapter test proves freshness without spending unapproved credits.',
};

export const METERING_BLOCKER: Blocker = {
  failure:
    'Replay-safe anonymous, free, and paid metering needs the vendor accounts. This session does not invent a spend path.',
  owner: 'Chartmetric, MusicFetch, and Social Blade credential owners',
  reviewTrigger:
    'Vendor accounts exist and a local test meters a replay without a live paid call.',
};

export const STORY_ENGINE_BLOCKER: Blocker = {
  failure:
    'Story Engine outreach and webhook delivery are not admitted. JOV-7788 and JOV-7789 stay unstarted.',
  owner: 'JOV-7788 / JOV-7789',
  reviewTrigger: 'Those issues are explicitly admitted for outreach.',
};

export const PRODUCTION_CERTIFICATION_BLOCKER: Blocker = {
  failure:
    'No deployed SHA and no seven-day production soak for resolver parity.',
  owner: 'JOV-7833 / production release controller',
  reviewTrigger:
    'A Production Verified marker exists for the resolver parity head, plus the seven-day soak named on JOV-7833.',
};
