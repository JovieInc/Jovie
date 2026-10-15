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
    'Independent source acquisition, per-use permissions, population/history coverage and canonical public projections are unverified. Public API documentation grants no data-use rights.',
  owner: 'JOV-7824 / JOV-7827 / JOV-7828',
  reviewTrigger:
    'The allocated implementation issue supplies permitted independent data, dated methodology/coverage receipts, canonical write/readback and deployed API/CLI/MCP evidence. No vendor token or spend is authorized by this catalog.',
};

export const CHARTMETRIC_SCORE_BLOCKER: Blocker = {
  failure:
    'Chartmetric Score is a vendor-owned opaque metric. This session does not copy or recompute it.',
  owner: 'Chartmetric',
  reviewTrigger:
    'A credentialed read is separately approved and the value is displayed as Chartmetric Score.',
};

export const SOCIALBLADE_RIGHTS_BLOCKER: Blocker = {
  failure:
    'Social Blade Developer Terms section 3.1 prohibit using API data in another product or a similar service. Public discovery samples do not grant product rights.',
  owner: 'JOV-7824 / Social Blade account owner',
  reviewTrigger:
    'Written permission covers Jovie product, API, CLI, MCP, retention and comparative use, or an independently permitted platform source replaces the vendor data.',
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
    'Requested archive depth can auto-downgrade, returned rows do not identify the granted history tier, and no permitted independent archive currently proves equivalent coverage.',
  owner: 'JOV-7824 / JOV-7829',
  reviewTrigger:
    'A permitted source returns actual samples with explicit coverage, gaps, buckets and freshness for the requested tier.',
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
