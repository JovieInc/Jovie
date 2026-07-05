/**
 * Heuristics for identifying seed/demo or undecoded-geo synthetic audience rows.
 *
 * Investigation notes (issue #11042):
 * - drizzle-seed.ts writes plain city names and `seed_fp_*` fingerprints.
 * - seed-demo-account.ts writes `fp_demo_*` fingerprints and `demo.aud.*@example.com`.
 * - URL-encoded geo_city values (e.g. Los%20Angeles) come from routes that store
 *   raw x-vercel-ip-city without decodeURIComponent (/api/track), not seed scripts.
 */

import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import {
  audienceMembers,
  clickEvents,
  dailyProfileViews,
} from '@/lib/db/schema/analytics';

export const SEED_FINGERPRINT_PREFIX = 'seed_fp_';
export const DEMO_FINGERPRINT_PREFIX = 'fp_demo_';
export const SEED_TESTNET_IP_PREFIX = '203.0.113.';

export type SyntheticAudienceReason =
  | 'seed-fingerprint'
  | 'demo-fingerprint'
  | 'seed-email'
  | 'demo-email'
  | 'encoded-geo-city'
  | 'seed-testnet-ip';

export function isUrlEncodedGeoCity(
  geoCity: string | null | undefined
): boolean {
  if (!geoCity) return false;
  return geoCity.includes('%');
}

export function classifySyntheticAudienceMember(input: {
  readonly fingerprint: string | null;
  readonly email: string | null;
  readonly geoCity: string | null;
}): SyntheticAudienceReason[] {
  const reasons: SyntheticAudienceReason[] = [];

  if (input.fingerprint?.startsWith(SEED_FINGERPRINT_PREFIX)) {
    reasons.push('seed-fingerprint');
  }
  if (input.fingerprint?.startsWith(DEMO_FINGERPRINT_PREFIX)) {
    reasons.push('demo-fingerprint');
  }
  if (
    input.email?.startsWith('seed.aud.') &&
    input.email.endsWith('@example.com')
  ) {
    reasons.push('seed-email');
  }
  if (
    input.email?.startsWith('demo.aud.') &&
    input.email.endsWith('@example.com')
  ) {
    reasons.push('demo-email');
  }
  if (isUrlEncodedGeoCity(input.geoCity)) {
    reasons.push('encoded-geo-city');
  }

  return reasons;
}

export function syntheticAudienceMemberWhere(profileId?: string): SQL<unknown> {
  const profileFilter = profileId
    ? drizzleSql`${audienceMembers.creatorProfileId} = ${profileId}`
    : drizzleSql`true`;

  return drizzleSql`
    ${profileFilter}
    AND (
      ${audienceMembers.fingerprint} LIKE ${`${SEED_FINGERPRINT_PREFIX}%`}
      OR ${audienceMembers.fingerprint} LIKE ${`${DEMO_FINGERPRINT_PREFIX}%`}
      OR ${audienceMembers.email} LIKE ${'seed.aud.%@example.com'}
      OR ${audienceMembers.email} LIKE ${'demo.aud.%@example.com'}
      OR ${audienceMembers.geoCity} LIKE ${'%\\%%'}
    )
  `;
}

export function syntheticClickEventWhere(profileId?: string): SQL<unknown> {
  const profileFilter = profileId
    ? drizzleSql`${clickEvents.creatorProfileId} = ${profileId}`
    : drizzleSql`true`;

  return drizzleSql`
    ${profileFilter}
    AND (
      ${clickEvents.ipAddress} LIKE ${`${SEED_TESTNET_IP_PREFIX}%`}
      OR ${clickEvents.city} LIKE ${'%\\%%'}
    )
  `;
}

export function syntheticDailyProfileViewsWhere(
  profileId?: string
): SQL<unknown> {
  const profileFilter = profileId
    ? drizzleSql`${dailyProfileViews.creatorProfileId} = ${profileId}`
    : drizzleSql`true`;

  // Seed scripts generate 90 contiguous days; only offer this path when the
  // caller passes --include-views alongside a scoped profile cleanup.
  return profileFilter;
}
