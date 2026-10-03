import 'server-only';

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

/** False after a 401. A missing token is checked by the caller, not latched. */
export function musicfetchNetworkAllowed(): boolean {
  return dormant === null;
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
