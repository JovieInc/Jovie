import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getPublicProfileDiscoveryExclusionReason } from './public-profile-indexing-policy';

export const PROFILE_COMPLETENESS_POLICY = 'profile-completeness/v1';
/** Recommended v1 policy: every mandatory dimension must pass. Not model confidence. */
export const PROFILE_COMPLETENESS_MINIMUM_SCORE = 100;
export const PROFILE_COMPLETENESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ProfileCompletenessSnapshot {
  readonly profileId: string;
  readonly revision: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  readonly destinations: readonly {
    readonly platform: string;
    readonly url: string;
  }[];
  readonly provenance: readonly {
    readonly kind: 'creator_profile' | 'public_source';
    readonly referenceId: string;
    readonly url: string;
  }[];
}

export interface ProfileCompletenessJudgment {
  readonly schemaVersion: typeof PROFILE_COMPLETENESS_POLICY;
  readonly profileId: string;
  readonly snapshotSha256: string;
  readonly policyVersion: typeof PROFILE_COMPLETENESS_POLICY;
  readonly evaluatedAt: string | null;
  readonly model: 'typesafe-ai/jev';
  readonly transportStatus: 'evaluated' | 'not_evaluated' | 'failed';
  readonly verdict: 'supported' | 'contradicted' | 'insufficient' | null;
  readonly reasons: readonly string[];
  readonly confidence: null;
}

const judgmentSchema = z
  .object({
    schemaVersion: z.literal(PROFILE_COMPLETENESS_POLICY),
    profileId: z.string().uuid(),
    snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
    policyVersion: z.literal(PROFILE_COMPLETENESS_POLICY),
    evaluatedAt: z.string().nullable(),
    model: z.literal('typesafe-ai/jev'),
    transportStatus: z.enum(['evaluated', 'not_evaluated', 'failed']),
    verdict: z.enum(['supported', 'contradicted', 'insufficient']).nullable(),
    reasons: z.array(z.string()),
    confidence: z.null(),
  })
  .strict();

const clean = (value: string | null) => (value ?? '').trim().normalize('NFC');
function isPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.hostname.includes('.') &&
      !url.hostname.endsWith('.local') &&
      !url.hostname.endsWith('.localhost') &&
      !url.hostname.endsWith('.internal') &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) &&
      !url.hostname.includes(':')
    );
  } catch {
    return false;
  }
}

/** Stable content identity; timestamps, billing, and ownership badges are not evidence. */
export function prepareProfileCompleteness(
  snapshot: ProfileCompletenessSnapshot
) {
  const canonical = {
    profileId: clean(snapshot.profileId),
    revision: clean(snapshot.revision),
    username: clean(snapshot.username).toLowerCase(),
    displayName: clean(snapshot.displayName),
    avatarUrl: clean(snapshot.avatarUrl),
    bio: clean(snapshot.bio),
    destinations: snapshot.destinations
      .map(item => ({ platform: clean(item.platform), url: clean(item.url) }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    provenance: snapshot.provenance
      .map(item => ({
        kind: item.kind,
        referenceId: clean(item.referenceId),
        url: clean(item.url),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  const checks = {
    identity:
      canonical.revision.length > 0 &&
      getPublicProfileDiscoveryExclusionReason(
        {
          handle: canonical.username,
          displayName: canonical.displayName,
          isPublic: true,
        },
        { requirePublication: true }
      ) === null,
    photo:
      isPublicUrl(canonical.avatarUrl) &&
      !/default[-_](?:user|avatar)|placeholder/i.test(canonical.avatarUrl),
    content:
      canonical.bio.length > 0 &&
      !/^(?:bio|artist|musician|podcast|coming soon|tbd|n\/a)$/i.test(
        canonical.bio
      ),
    destinations:
      canonical.destinations.length > 0 &&
      canonical.destinations.every(
        item => item.platform.length > 0 && isPublicUrl(item.url)
      ),
    provenance:
      canonical.provenance.length > 0 &&
      canonical.provenance.every(
        item =>
          ['creator_profile', 'public_source'].includes(item.kind) &&
          item.referenceId.length > 0 &&
          isPublicUrl(item.url)
      ),
  };
  const canonicalJson = JSON.stringify(canonical);
  return {
    profileId: canonical.profileId,
    policyVersion: PROFILE_COMPLETENESS_POLICY,
    canonicalJson,
    snapshotSha256: createHash('sha256').update(canonicalJson).digest('hex'),
    checks,
    score: Object.values(checks).filter(Boolean).length * 20,
    reasons: Object.entries(checks)
      .filter(([, pass]) => !pass)
      .map(([key]) => `missing_${key}`),
  };
}

/** Call with a server-owned judgment only; client settings are never a certificate. */
export function assessProfileCompleteness(
  snapshot: ProfileCompletenessSnapshot,
  judgment: unknown,
  now = new Date()
) {
  const prepared = prepareProfileCompleteness(snapshot);
  const reasons = [...prepared.reasons];
  const parsedJudgment = judgmentSchema.safeParse(judgment);
  if (!judgment) reasons.push('evaluation_missing');
  else if (!parsedJudgment.success) reasons.push('evaluation_mismatch');
  else {
    const receipt = parsedJudgment.data;
    if (
      receipt.schemaVersion !== PROFILE_COMPLETENESS_POLICY ||
      receipt.policyVersion !== PROFILE_COMPLETENESS_POLICY ||
      receipt.profileId !== prepared.profileId ||
      receipt.snapshotSha256 !== prepared.snapshotSha256 ||
      receipt.model !== 'typesafe-ai/jev' ||
      receipt.confidence !== null
    )
      reasons.push('evaluation_mismatch');
    const evaluatedAt = receipt.evaluatedAt
      ? Date.parse(receipt.evaluatedAt)
      : NaN;
    const age = now.getTime() - evaluatedAt;
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age > PROFILE_COMPLETENESS_MAX_AGE_MS
    )
      reasons.push('evaluation_stale');
    if (receipt.transportStatus !== 'evaluated')
      reasons.push('evaluation_not_completed');
    if (receipt.verdict !== 'supported')
      reasons.push('evaluation_not_supported');
  }
  return {
    ...prepared,
    reasons,
    eligible:
      prepared.score >= PROFILE_COMPLETENESS_MINIMUM_SCORE &&
      reasons.length === 0,
  };
}
