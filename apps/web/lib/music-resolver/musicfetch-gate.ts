import 'server-only';

import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { logger } from '@/lib/utils/logger';

/**
 * MusicFetch is unpaid (401 "subscription not active"). Detectors must file
 * `remediation:musicfetch-*` against JOV-7323. Do not open a renewal task.
 */
export const MUSICFETCH_REMEDIATION_ISSUE = 'JOV-7323' as const;

export type MusicfetchDormantReason =
  | 'missing_token'
  | 'subscription_inactive'
  | 'unauthorized';

export interface MusicfetchRemediation {
  readonly fingerprint: `remediation:musicfetch-${string}`;
  readonly issue: typeof MUSICFETCH_REMEDIATION_ISSUE;
  /** Renewal is intentionally not the remediation. */
  readonly renewal: false;
}

let dormant: MusicfetchDormantReason | null = null;

export type MusicResolverFamily = 'provider_links' | 'release_facts';

const MUSIC_RESOLVER_FAMILY_FLAGS = {
  provider_links: 'MUSIC_RESOLVER_PROVIDER_LINKS',
  release_facts: 'MUSIC_RESOLVER_RELEASE_FACTS',
} as const;

export const MUSICFETCH_RESIDUAL_ADAPTERS = [
  'app/onboarding/actions/connect-spotify.ts',
  'app/onboarding/actions/enrich-profile.ts',
  'lib/agent-acquisition/release-resolution.ts',
  'lib/discography/discovery.ts',
  'lib/discography/provider-links.ts',
  'lib/discography/unclaimed-artist-enrichment.ts',
  'lib/dsp-enrichment/jobs/musicfetch-enrichment.ts',
  'lib/ingestion/jobs.ts',
  'lib/onboarding/claim-profile.ts',
] as const;

export function isMusicResolverFamilyEnabled(
  family: MusicResolverFamily
): boolean {
  return (
    isCodeFlagEnabled(MUSIC_RESOLVER_FAMILY_FLAGS[family]) ||
    isCodeFlagEnabled('IN_HOUSE_RESOLVER')
  );
}

export function musicfetchRemediationFingerprint(
  reason: MusicfetchDormantReason
): `remediation:musicfetch-${string}` {
  if (reason === 'subscription_inactive') {
    return 'remediation:musicfetch-subscription-inactive';
  }
  if (reason === 'missing_token') {
    return 'remediation:musicfetch-missing-token';
  }
  return 'remediation:musicfetch-unauthorized';
}

export function musicfetchRemediation(
  reason: MusicfetchDormantReason
): MusicfetchRemediation {
  return {
    fingerprint: musicfetchRemediationFingerprint(reason),
    issue: MUSICFETCH_REMEDIATION_ISSUE,
    renewal: false,
  };
}

export function isMusicfetchSubscriptionInactive(detail: string): boolean {
  return /subscription not active/i.test(detail);
}

export function isMusicfetchFallbackEnabled(): boolean {
  const allFamiliesCutOver =
    isCodeFlagEnabled('MUSIC_RESOLVER_PROVIDER_LINKS') &&
    isCodeFlagEnabled('MUSIC_RESOLVER_RELEASE_FACTS');
  return isCodeFlagEnabled('MUSICFETCH_FALLBACK') || !allFamiliesCutOver;
}

/** False when vendor-off is configured or after a 401. */
export function musicfetchNetworkAllowed(): boolean {
  return isMusicfetchFallbackEnabled() && dormant === null;
}

export function musicfetchDormantReason(): MusicfetchDormantReason | null {
  return dormant;
}

export function noteMusicfetchDormant(
  reason: Exclude<MusicfetchDormantReason, 'missing_token'>
): MusicfetchRemediation {
  const remediation = musicfetchRemediation(reason);
  if (dormant === reason) return remediation;
  dormant = reason;
  logger.warn('MusicFetch is dormant; route the failure to the cutover issue', {
    fingerprint: remediation.fingerprint,
    issue: remediation.issue,
    renewal: remediation.renewal,
  });
  return remediation;
}

export function noteMusicfetchHttpStatus(
  status: number | undefined,
  detail: string | undefined
): MusicfetchRemediation | null {
  if (status !== 401) return null;
  return noteMusicfetchDormant(
    isMusicfetchSubscriptionInactive(detail ?? '')
      ? 'subscription_inactive'
      : 'unauthorized'
  );
}

export function noteMusicfetchMissingToken(): MusicfetchRemediation {
  return musicfetchRemediation('missing_token');
}

export function resetMusicfetchDormantForTests(): void {
  dormant = null;
}

/** Safe startup receipt for exact deployed cutover/rollback configuration. */
export function musicResolverCutoverReceipt() {
  return {
    schema: 'jovie.music-resolver-cutover/v1',
    buildSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    families: {
      provider_links: isMusicResolverFamilyEnabled('provider_links'),
      release_facts: isMusicResolverFamilyEnabled('release_facts'),
      smart_link_creation: true,
    },
    musicfetch: {
      dormantReason: dormant,
      fallbackEnabled: isMusicfetchFallbackEnabled(),
      networkAllowed: musicfetchNetworkAllowed(),
      vendorOffRequested: !isCodeFlagEnabled('MUSICFETCH_FALLBACK'),
    },
    residualVendorAdapters: MUSICFETCH_RESIDUAL_ADAPTERS,
    rollback: {
      enableVendorFallback: 'FEATURE_MUSICFETCH_FALLBACK=true',
      providerLinks: 'FEATURE_MUSIC_RESOLVER_PROVIDER_LINKS=false',
      releaseFacts: 'FEATURE_MUSIC_RESOLVER_RELEASE_FACTS=false',
    },
  } as const;
}
