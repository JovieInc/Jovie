/** Redis outage inventory. Tests pin completeness and requireRedis. */

import { RATE_LIMITERS, type RateLimiterName } from './config';

export type RedisOutageClass = 'mandatory' | 'advisory' | 'optional' | 'local';
export type RedisCallerUnavailableAction = 'deny' | 'allow' | 'drop';

export interface RedisLimiterOutagePolicy {
  readonly class: RedisOutageClass;
  readonly callerOnUnavailable: RedisCallerUnavailableAction;
  readonly quotaContribution: 'analytics' | 'fixed-window' | 'none';
}

const mandatoryDeny = {
  class: 'mandatory',
  callerOnUnavailable: 'deny',
  quotaContribution: 'analytics',
} as const satisfies RedisLimiterOutagePolicy;

const mandatoryDenyFixed = {
  class: 'mandatory',
  callerOnUnavailable: 'deny',
  quotaContribution: 'fixed-window',
} as const satisfies RedisLimiterOutagePolicy;

const advisoryAllow = {
  class: 'advisory',
  callerOnUnavailable: 'allow',
  quotaContribution: 'fixed-window',
} as const satisfies RedisLimiterOutagePolicy;

const advisoryDeny = {
  class: 'advisory',
  callerOnUnavailable: 'deny',
  quotaContribution: 'analytics',
} as const satisfies RedisLimiterOutagePolicy;

const advisoryDenyFixed = {
  class: 'advisory',
  callerOnUnavailable: 'deny',
  quotaContribution: 'fixed-window',
} as const satisfies RedisLimiterOutagePolicy;

const optionalDrop = {
  class: 'optional',
  callerOnUnavailable: 'drop',
  quotaContribution: 'fixed-window',
} as const satisfies RedisLimiterOutagePolicy;

const localOnly = {
  class: 'local',
  callerOnUnavailable: 'deny',
  quotaContribution: 'none',
} as const satisfies RedisLimiterOutagePolicy;

/** One entry per RATE_LIMITERS key. Mandatory except MusicBrainz must set requireRedis. */
export const RATE_LIMIT_OUTAGE_POLICY = {
  albumArtGeneration: mandatoryDeny,
  albumArtGenerationBurst: mandatoryDeny,
  youtubeThumbnailPreviewBurst: mandatoryDenyFixed,
  youtubeThumbnailPreviewCooldown: mandatoryDenyFixed,
  youtubeThumbnailPreviewVisitor: mandatoryDenyFixed,
  youtubeThumbnailPreviewChannel: mandatoryDenyFixed,
  paymentIntent: mandatoryDeny,
  tipCheckout: mandatoryDeny,
  merchCheckout: mandatoryDeny,
  aiChatWeeklyFree: mandatoryDeny,
  aiChatWeeklyTrial: mandatoryDeny,
  aiChatWeeklyPro: mandatoryDeny,
  aiChatWeeklyMax: mandatoryDeny,
  onboarding: mandatoryDenyFixed,
  anonymousOnboardingChatIp: mandatoryDenyFixed,
  anonymousOnboardingChatAsn: mandatoryDenyFixed,
  anonymousOnboardingChatSession: mandatoryDenyFixed,
  adminImpersonate: mandatoryDeny,
  deployPromote: mandatoryDeny,
  accountDelete: mandatoryDeny,
  publicArtistApi: mandatoryDenyFixed,
  general: mandatoryDenyFixed,
  changelogSubscribe: mandatoryDenyFixed,
  musicBrainzLookup: mandatoryDeny,

  claimTokenAccess: advisoryAllow,
  publicClick: advisoryAllow,
  aiChat: advisoryAllow,
  avatarUpload: advisoryDeny,
  artworkUpload: advisoryDeny,
  api: advisoryDenyFixed,
  handleCheck: advisoryDenyFixed,
  dashboardLinks: advisoryDenyFixed,
  headerSearch: advisoryDenyFixed,
  adminFitScores: advisoryDeny,
  adminOutreach: advisoryDeny,
  adminCreatorIngest: advisoryDeny,
  publicProfile: advisoryAllow,
  publicVisit: advisoryAllow,
  spotifySearch: advisoryDenyFixed,
  spotifySearchApi: advisoryDenyFixed,
  spotifyClaim: advisoryDeny,
  spotifyRefresh: advisoryDeny,
  appleMusicLookup: advisoryDeny,
  appleMusicSearch: advisoryDenyFixed,
  appleMusicBulkIsrc: advisoryDeny,
  deezerLookup: advisoryDeny,
  dspDiscovery: advisoryDeny,
  dspEnrichment: advisoryDeny,
  isrcRescan: advisoryDeny,
  appleMusicRescanFree: advisoryDeny,
  appleMusicRescanPaid: advisoryDeny,
  releaseRefreshFree: advisoryDeny,
  releaseRefreshPaid: advisoryDeny,
  bandsintownSync: advisoryDeny,
  wrapLink: advisoryDeny,
  wrapLinkAnonymous: advisoryDeny,
  accountExport: advisoryDeny,
  accountEmail: advisoryDeny,
  verificationRequest: advisoryDeny,
  bioImportFromUrl: advisoryDeny,
  bioImportFromUrlHourly: advisoryDeny,
  inspectPressSource: advisoryDeny,
  inspectPressSourceHourly: advisoryDeny,

  navigationTelemetry: optionalDrop,
  trackingClicks: optionalDrop,
  trackingVisits: optionalDrop,
  trackingIpClicks: optionalDrop,
  trackingIpVisits: optionalDrop,
  publicProfileCaptureDismissal: optionalDrop,
  publicProfilePacEvent: optionalDrop,

  health: localOnly,
  spotifyPublicSearch: localOnly,
} as const satisfies Record<RateLimiterName, RedisLimiterOutagePolicy>;

export interface RedisDataConsumerPolicy {
  readonly class: RedisOutageClass;
  readonly recovery: string;
  readonly staleBound?: string;
}

export const REDIS_DATA_CONSUMERS = {
  'auth/secondary-storage': {
    class: 'mandatory',
    recovery: 'Postgres sessions; delete fail-closed when Redis is reachable',
  },
  'musicfetch/budget-guard': {
    class: 'mandatory',
    recovery: 'Deny in production when Redis is missing',
  },
  'profile-search/budget': {
    class: 'mandatory',
    recovery: 'Deny in production when Redis is missing',
  },
  'webhooks/recent-dispatch': {
    class: 'mandatory',
    recovery: 'Deny in production when Redis is missing',
  },
  idempotency: {
    class: 'mandatory',
    recovery: 'requireBackend fail-closed; otherwise bounded memory',
  },
  'db/cache': {
    class: 'optional',
    recovery: 'Origin-read on miss',
    staleBound: 'ttlSeconds (default 60s)',
  },
  'onboarding/handle-availability-cache': {
    class: 'optional',
    recovery: 'Origin-read on miss',
    staleBound: '5m available / 30d claimed',
  },
  'auth/ban-check': {
    class: 'optional',
    recovery: 'Origin DB; fail-open only if DB and cache are down',
    staleBound: '2m active / 5m banned',
  },
  'auth/sentry-rate-limit': {
    class: 'optional',
    recovery: 'Drop/sample; fail-open to captureError',
  },
} as const satisfies Record<string, RedisDataConsumerPolicy>;

function limiterRequiresRedis(
  config: (typeof RATE_LIMITERS)[RateLimiterName]
): boolean {
  return 'requireRedis' in config && config.requireRedis === true;
}

export function unpinnedLimiterPolicies(
  limiterNames: readonly string[],
  policies: Readonly<Record<string, RedisLimiterOutagePolicy>>
): string[] {
  return limiterNames.filter(name => policies[name] === undefined).sort();
}

export function mandatoryLimitersMissingRequireRedis(
  configs: typeof RATE_LIMITERS,
  policies: typeof RATE_LIMIT_OUTAGE_POLICY = RATE_LIMIT_OUTAGE_POLICY
): string[] {
  return (Object.keys(policies) as RateLimiterName[])
    .filter(name => policies[name].class === 'mandatory')
    .filter(name => name !== 'musicBrainzLookup')
    .filter(name => !limiterRequiresRedis(configs[name]))
    .sort();
}

export function wrongPolicyLimiters(
  configs: typeof RATE_LIMITERS,
  policies: typeof RATE_LIMIT_OUTAGE_POLICY = RATE_LIMIT_OUTAGE_POLICY
): string[] {
  return (Object.keys(policies) as RateLimiterName[])
    .filter(name => {
      const policy = policies[name];
      const requiresRedis = limiterRequiresRedis(configs[name]);
      if (policy.class === 'mandatory' && name !== 'musicBrainzLookup') {
        return !requiresRedis;
      }
      if (policy.class === 'local') {
        return requiresRedis;
      }
      return false;
    })
    .sort();
}
