/** JOV-6572 fail-closed certification of the JOV-6571 first-cohort journey. */

export const CANONICAL_ARTIST_SITE_CERTIFICATION_CONTRACT =
  'jovie.canonical-artist-site-certification/v1' as const;

export const CANONICAL_ARTIST_SITE_REFERENCE = {
  decision: 'JOV-6571',
  document: 'docs/product/canonical-artist-site-experience.md',
  artist: 'Tim White',
  profileUrl: 'https://jov.ie/tim',
} as const;

export const CANONICAL_ARTIST_SITE_CHECKS = [
  'identity_catalog',
  'profile_hierarchy',
  'profile_modes',
  'release_smart_link',
  'deferred_surfaces',
  'waitlist_admission',
  'claim_auth_intent',
  'ownership_existing_profile',
  'refresh_back_retry',
  'free_state_value',
  'pro_handoff_199',
  'payment_entitlement',
  'immediate_value',
] as const;

export type CanonicalArtistSiteCheckId =
  (typeof CANONICAL_ARTIST_SITE_CHECKS)[number];
export type CanonicalArtistSiteLayer =
  | 'identity'
  | 'experience'
  | 'state_transitions'
  | 'revenue';
export type CanonicalArtistSiteReceiptStatus =
  | 'passed'
  | 'failed'
  | 'hidden'
  | 'not_applicable';

interface CheckDefinition {
  readonly id: CanonicalArtistSiteCheckId;
  readonly layer: CanonicalArtistSiteLayer;
  readonly referenceRule: string;
  readonly hiddenAllowed: boolean;
}

const CHECK_SPEC = `
identity_catalog identity Tim White identity and supported catalog stay truthful.
profile_hierarchy experience Artist identity, current music, and Listen lead.
profile_modes experience Home, Music, Events, and About remain one coherent site.
release_smart_link experience Release destinations retain an explicit artist return path.
deferred_surfaces experience Tips, broad AI, deep intelligence, and operator controls stay hidden.
waitlist_admission state_transitions Only explicitly admitted artists cross the waitlist gate.
claim_auth_intent state_transitions Claim candidate intent survives the auth boundary.
ownership_existing_profile identity Claim attaches to the premade profile without duplication or data loss.
refresh_back_retry state_transitions Refresh, back, retry, and failed claim states remain recoverable.
free_state_value revenue Free keeps a durable profile and useful audience capture.
pro_handoff_199 revenue Eligible artists see a truthful, non-coercive $199/mo handoff.
payment_entitlement revenue Checkout, verified entitlement, cancel, and failure states agree.
immediate_value revenue Claim and verified payment each land in an honest next-value state.
`.trim();

export const CANONICAL_ARTIST_SITE_CHECK_DEFINITIONS: readonly CheckDefinition[] =
  CHECK_SPEC.split('\n').map(line => {
    const [id, layer, ...words] = line.split(' ');
    return {
      id: id as CanonicalArtistSiteCheckId,
      layer: layer as CanonicalArtistSiteLayer,
      referenceRule: words.join(' '),
      hiddenAllowed: id === 'deferred_surfaces',
    };
  });

if (
  CANONICAL_ARTIST_SITE_CHECK_DEFINITIONS.map(check => check.id).join() !==
  CANONICAL_ARTIST_SITE_CHECKS.join()
) {
  throw new Error('canonical artist-site check spec drifted');
}

export interface CanonicalArtistSiteReceipt {
  readonly checkId: CanonicalArtistSiteCheckId;
  readonly candidateId: string;
  readonly runId: string;
  readonly sourceRevision: string;
  readonly observedAt: string;
  readonly status: CanonicalArtistSiteReceiptStatus;
  readonly detail: string;
  readonly evidence: readonly string[];
  readonly defectRef?: string;
}

export interface CanonicalArtistSiteCertificationInput {
  readonly candidateId: string;
  readonly runId: string;
  readonly sourceRevision: string;
  readonly evaluatedAt: string;
  readonly checkoutApplicable: boolean;
  /** Hidden checks named here are part of the cohort promise and therefore fail. */
  readonly cohortPromiseDependencies?: readonly CanonicalArtistSiteCheckId[];
  readonly receipts: readonly CanonicalArtistSiteReceipt[];
}

export interface CanonicalArtistSiteCheckResult extends CheckDefinition {
  readonly status: 'passed' | 'failed' | 'hidden' | 'not_applicable';
  readonly detail: string;
  readonly evidence: readonly string[];
  readonly defectRef: string | null;
}

export interface CanonicalArtistSiteCertification {
  readonly contract: typeof CANONICAL_ARTIST_SITE_CERTIFICATION_CONTRACT;
  readonly reference: typeof CANONICAL_ARTIST_SITE_REFERENCE;
  readonly candidateId: string;
  readonly runId: string;
  readonly sourceRevision: string;
  readonly evaluatedAt: string;
  readonly status: 'RED' | 'GREEN';
  readonly statusLine:
    | 'RED — not safe to send an artist through'
    | 'GREEN — safe to send an artist through';
  readonly safeToSend: boolean;
  readonly queue: 'blocked' | 'human_review_send';
  readonly checks: readonly CanonicalArtistSiteCheckResult[];
  readonly failingChecks: readonly CanonicalArtistSiteCheckResult[];
  readonly evidenceIntegrityFailures: readonly string[];
}

function validIdentityPart(value: string): boolean {
  return value.trim().length > 0 && value.length <= 200;
}

function receiptEnvelopeFailures(
  receipt: CanonicalArtistSiteReceipt,
  input: CanonicalArtistSiteCertificationInput
): string[] {
  const failures: string[] = [];
  if (receipt.candidateId !== input.candidateId)
    failures.push(`${receipt.checkId}: candidate mismatch`);
  if (receipt.runId !== input.runId)
    failures.push(`${receipt.checkId}: run mismatch`);
  if (receipt.sourceRevision !== input.sourceRevision)
    failures.push(`${receipt.checkId}: source revision mismatch`);
  if (!Number.isFinite(Date.parse(receipt.observedAt)))
    failures.push(`${receipt.checkId}: invalid observedAt`);
  if (!receipt.detail.trim())
    failures.push(`${receipt.checkId}: detail missing`);
  if (
    receipt.evidence.length === 0 ||
    receipt.evidence.some(item => !item.trim())
  )
    failures.push(`${receipt.checkId}: immutable evidence missing`);
  return failures;
}

export function evaluateCanonicalArtistSiteCertification(
  input: CanonicalArtistSiteCertificationInput
): CanonicalArtistSiteCertification {
  const integrityFailures: string[] = [];
  if (!validIdentityPart(input.candidateId))
    integrityFailures.push('candidateId missing or invalid');
  if (!validIdentityPart(input.runId))
    integrityFailures.push('runId missing or invalid');
  if (!validIdentityPart(input.sourceRevision))
    integrityFailures.push('sourceRevision missing or invalid');
  if (!Number.isFinite(Date.parse(input.evaluatedAt)))
    integrityFailures.push('evaluatedAt invalid');

  const byCheck = new Map<
    CanonicalArtistSiteCheckId,
    CanonicalArtistSiteReceipt[]
  >();
  for (const receipt of input.receipts) {
    const matches = byCheck.get(receipt.checkId) ?? [];
    matches.push(receipt);
    byCheck.set(receipt.checkId, matches);
    integrityFailures.push(...receiptEnvelopeFailures(receipt, input));
  }

  const promiseDependencies = new Set(input.cohortPromiseDependencies ?? []);
  const checks = CANONICAL_ARTIST_SITE_CHECK_DEFINITIONS.map(definition => {
    const matches = byCheck.get(definition.id) ?? [];
    if (matches.length !== 1) {
      const detail =
        matches.length === 0
          ? 'Required receipt is missing.'
          : 'More than one receipt exists for this candidate/run.';
      integrityFailures.push(`${definition.id}: ${detail}`);
      return {
        ...definition,
        status: 'failed' as const,
        detail,
        evidence: [] as readonly string[],
        defectRef: null,
      };
    }

    const receipt = matches[0]!;
    const envelopeIsValid =
      receiptEnvelopeFailures(receipt, input).length === 0;
    const hiddenIsValid =
      receipt.status === 'hidden' &&
      definition.hiddenAllowed &&
      !promiseDependencies.has(definition.id);
    const notApplicableIsValid =
      receipt.status === 'not_applicable' &&
      definition.id === 'payment_entitlement' &&
      !input.checkoutApplicable;
    const accepted =
      envelopeIsValid &&
      (receipt.status === 'passed' || hiddenIsValid || notApplicableIsValid);

    return {
      ...definition,
      status: accepted ? receipt.status : ('failed' as const),
      detail: accepted
        ? receipt.detail
        : receipt.status === 'hidden'
          ? 'A cohort-promised or required surface cannot be hidden.'
          : receipt.status === 'not_applicable'
            ? 'This check is applicable to the current journey.'
            : receipt.detail,
      evidence: receipt.evidence,
      defectRef: receipt.defectRef ?? null,
    };
  });

  const failingChecks = checks.filter(check => check.status === 'failed');
  const safeToSend =
    failingChecks.length === 0 && integrityFailures.length === 0;
  return {
    contract: CANONICAL_ARTIST_SITE_CERTIFICATION_CONTRACT,
    reference: CANONICAL_ARTIST_SITE_REFERENCE,
    candidateId: input.candidateId,
    runId: input.runId,
    sourceRevision: input.sourceRevision,
    evaluatedAt: input.evaluatedAt,
    status: safeToSend ? 'GREEN' : 'RED',
    statusLine: safeToSend
      ? 'GREEN — safe to send an artist through'
      : 'RED — not safe to send an artist through',
    safeToSend,
    queue: safeToSend ? 'human_review_send' : 'blocked',
    checks,
    failingChecks,
    evidenceIntegrityFailures: [...new Set(integrityFailures)],
  };
}
