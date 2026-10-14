export const SOCIALBLADE_DOC_URL = 'https://socialblade.com/developers/docs';
export const SOCIALBLADE_TERMS_URL =
  'https://socialblade.com/info/developer-terms';
export const SOCIALBLADE_CONTRACT_VERSION = '2026-10-14';

export const SOCIALBLADE_PLATFORMS = [
  'facebook',
  'instagram',
  'tiktok',
  'twitch',
  'youtube',
] as const;

export type SocialBladePlatform = (typeof SOCIALBLADE_PLATFORMS)[number];

export const SOCIALBLADE_KINDS = [
  'grade',
  'history',
  'sbrank',
  'statistics-fields',
  'statistics-input',
  'statistics-option',
  'top-filter',
  'top-pagination',
] as const;

export type SocialBladeKind = (typeof SOCIALBLADE_KINDS)[number];

export interface SocialBladeHistoryOption {
  readonly key: 'archive' | 'default' | 'extended' | 'vault';
  readonly credits: 1 | 2 | 3 | 5;
  readonly maximumWindow: '30 days' | '1 year' | '3 years' | '10 years';
  readonly autoDowngrades: boolean;
}

export interface SocialBladePlatformSpec {
  readonly platform: SocialBladePlatform;
  readonly profileInputs: readonly string[];
  readonly history: readonly SocialBladeHistoryOption[];
  readonly fields: {
    readonly identity: readonly string[];
    readonly totals: readonly string[];
    readonly growth: readonly string[];
    readonly daily: readonly string[];
    readonly metadata: readonly string[];
    readonly ranks: readonly string[];
  };
  readonly topFilters: readonly string[];
  readonly topFallback: string;
}

const defaultHistory: SocialBladeHistoryOption = {
  key: 'default',
  credits: 1,
  maximumWindow: '30 days',
  autoDowngrades: false,
};

const extendedHistory: SocialBladeHistoryOption = {
  key: 'extended',
  credits: 2,
  maximumWindow: '1 year',
  autoDowngrades: true,
};

const archiveHistory: SocialBladeHistoryOption = {
  key: 'archive',
  credits: 3,
  maximumWindow: '3 years',
  autoDowngrades: true,
};

const vaultHistory: SocialBladeHistoryOption = {
  key: 'vault',
  credits: 5,
  maximumWindow: '10 years',
  autoDowngrades: true,
};

const longHistory = [
  defaultHistory,
  extendedHistory,
  archiveHistory,
  vaultHistory,
] as const;

/**
 * Public documentation contract reviewed on SOCIALBLADE_CONTRACT_VERSION.
 * Daily dates have no documented bucket timezone. Top-list snapshot time,
 * comparison population, coverage and tie rules are also undocumented.
 */
export const SOCIALBLADE_PLATFORM_SPECS: Readonly<
  Record<SocialBladePlatform, SocialBladePlatformSpec>
> = {
  facebook: {
    platform: 'facebook',
    profileInputs: ['page-username'],
    history: longHistory,
    fields: {
      identity: ['id', 'username', 'display_name'],
      totals: ['likes', 'talking_about'],
      growth: ['likes', 'talking_about'],
      daily: ['date', 'likes', 'talking_about'],
      metadata: [
        'branding.avatar',
        'branding.banner',
        'sb_verified (vendor dashboard-link only)',
      ],
      ranks: ['sbrank', 'likes', 'talking_about'],
    },
    topFilters: ['likes', 'sbrank'],
    topFallback: 'likes',
  },
  instagram: {
    platform: 'instagram',
    profileInputs: ['username'],
    history: longHistory,
    fields: {
      identity: ['id', 'username', 'display_name'],
      totals: ['followers', 'following', 'media', 'engagement_rate'],
      growth: ['followers', 'media'],
      daily: [
        'date',
        'followers',
        'following',
        'media',
        'avg_likes',
        'avg_comments',
      ],
      metadata: [
        'branding.avatar',
        'branding.website',
        'media.recent.id',
        'media.recent.time',
        'media.recent.type',
        'media.recent.post_url',
        'sb_verified (vendor dashboard-link only)',
      ],
      ranks: ['sbrank', 'followers', 'following', 'media', 'engagement_rate'],
    },
    topFilters: [
      'engagement-rate',
      'followers',
      'following',
      'media',
      'sbrank',
    ],
    topFallback: 'followers',
  },
  tiktok: {
    platform: 'tiktok',
    profileInputs: ['username'],
    history: longHistory,
    fields: {
      identity: ['id', 'username', 'display_name'],
      totals: ['followers', 'following', 'likes', 'uploads'],
      growth: [],
      daily: ['date', 'followers', 'following', 'uploads', 'likes'],
      metadata: ['branding.avatar', 'sb_verified (vendor dashboard-link only)'],
      ranks: ['sbrank', 'followers', 'following', 'uploads', 'likes'],
    },
    topFilters: ['followers', 'following', 'likes', 'sbrank', 'videos'],
    topFallback: 'followers',
  },
  twitch: {
    platform: 'twitch',
    profileInputs: ['username'],
    history: longHistory,
    fields: {
      identity: ['id', 'username', 'display_name'],
      totals: ['followers', 'views (deprecated)'],
      growth: ['followers'],
      daily: ['date', 'followers', 'views (deprecated)'],
      metadata: [
        'geo.broadcaster_language',
        'branding.avatar',
        'branding.banner',
        'sb_verified (vendor dashboard-link only)',
        'recent.game',
        'recent.status',
        'mature_warning',
      ],
      ranks: ['sbrank', 'followers', 'views (deprecated)'],
    },
    topFilters: ['followers', 'sbrank'],
    topFallback: 'followers',
  },
  youtube: {
    platform: 'youtube',
    profileInputs: [
      'channelid (preferred)',
      'username',
      'cusername',
      '@handle',
    ],
    history: [defaultHistory, extendedHistory, archiveHistory],
    fields: {
      identity: ['id', 'username', 'display_name', 'cusername', 'handle'],
      totals: ['uploads', 'subscribers', 'views'],
      growth: ['subs', 'vidviews'],
      daily: ['date', 'subs', 'views'],
      metadata: [
        'created_at',
        'channel_type',
        'geo',
        'branding.avatar',
        'branding.banner',
        'branding.website',
        'branding.social',
        'sb_verified (vendor dashboard-link only)',
        'made_for_kids',
      ],
      ranks: ['sbrank', 'subscribers', 'views', 'country', 'channel_type'],
    },
    topFilters: ['sbrank', 'subscribers'],
    topFallback: 'subscribers',
  },
};

export interface SocialBladeRow {
  readonly platform: SocialBladePlatform;
  readonly kind: SocialBladeKind;
  readonly key: string;
  readonly capability: string;
}

const growthPeriods = '1,3,7,14,30,60,90,180,365 days';
const statisticsEnvelope =
  'status(success,status,error); info(access.seconds_to_expire,credits.available)';

function rowsFor(spec: SocialBladePlatformSpec): SocialBladeRow[] {
  const fields = spec.fields;
  return [
    ...spec.profileInputs.map(input => ({
      platform: spec.platform,
      kind: 'statistics-input' as const,
      key: input.replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/(^-|-$)/g, ''),
      capability: `statistics query accepts ${input}`,
    })),
    {
      platform: spec.platform,
      kind: 'statistics-option',
      key: 'allow-stale',
      capability:
        'statistics allow-stale boolean; profile access lasts 30 days while source refresh is best-effort daily and not guaranteed',
    },
    {
      platform: spec.platform,
      kind: 'statistics-fields',
      key: 'documented',
      capability: `${statisticsEnvelope}; identity(${fields.identity.join(',')}); totals(${fields.totals.join(',')}); growth(${fields.growth.join(',') || 'none'})${fields.growth.length ? ` over ${growthPeriods}` : ''}; daily(${fields.daily.join(',')}) with timezone undocumented; metadata(${fields.metadata.join(',')}); ranks(${fields.ranks.join(',')})`,
    },
    ...spec.history.map(option => ({
      platform: spec.platform,
      kind: 'history' as const,
      key: option.key,
      capability: `${option.key} history: up to ${option.maximumWindow}, ${option.credits} credit${option.credits === 1 ? '' : 's'}, auto-downgrade=${option.autoDowngrades}; actual coverage and timezone not returned as explicit metadata`,
    })),
    ...spec.topFilters.map(filter => ({
      platform: spec.platform,
      kind: 'top-filter' as const,
      key: filter,
      capability:
        filter === 'sbrank'
          ? `top filter sbrank is disabled and falls back to ${spec.topFallback}`
          : `top filter ${filter}`,
    })),
    {
      platform: spec.platform,
      kind: 'top-pagination',
      key: 'page',
      capability:
        'top page input; 100 results per paid page and 48-hour access window; lists update regularly but snapshot time, population, coverage and tie rules are undocumented',
    },
    {
      platform: spec.platform,
      kind: 'grade',
      key: 'grade',
      capability: 'proprietary grade and color',
    },
    {
      platform: spec.platform,
      kind: 'sbrank',
      key: 'sbrank',
      capability: 'proprietary sbrank output',
    },
  ];
}

export const SOCIALBLADE_ROWS: readonly SocialBladeRow[] =
  SOCIALBLADE_PLATFORMS.flatMap(platform =>
    rowsFor(SOCIALBLADE_PLATFORM_SPECS[platform])
  ).sort((left, right) =>
    `${left.platform}:${left.kind}:${left.key}`.localeCompare(
      `${right.platform}:${right.kind}:${right.key}`
    )
  );
