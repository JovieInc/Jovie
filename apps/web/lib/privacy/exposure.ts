/**
 * Owner-authorized privacy exposure domain model (JOV-7141).
 *
 * Canonical types and transitions for detecting unintended personal-data
 * exposure about a *verified* subject and routing removal through the
 * cheapest safe provider path. This module is deliberately provider- and
 * storage-agnostic: detection vendors and removal vendors are replaceable
 * capabilities behind these canonical states, and swapping a provider must
 * never change the customer-visible action/state model.
 *
 * Invariants enforced here:
 * - No sensitive lookup may be planned without a verified subject binding.
 * - Findings carry redacted values only; raw sensitive values never enter
 *   the finding, telemetry, or receipt payloads.
 * - "Requested" is never "removed": the lifecycle distinguishes request
 *   sent, provider receipt, pending, verified removed, rejected, and
 *   recurrence.
 */

export const EXPOSURE_CLASSES = [
  /** Listed intentionally by the owner (e.g. a public booking email). */
  'public-by-design',
  /** Sensitive data public where the owner plausibly did not intend it. */
  'unintended-exposure',
  /** Listed in a data-broker / people-search record. */
  'data-broker-listing',
  /** Sourced from a known breach-derived lookup product. */
  'breach-derived',
  /** Personal data that is public but stale or incorrect. */
  'stale-data',
  /** Signal exists but cannot yet be classified. */
  'ambiguous',
  /** Source could not be checked; unknown stays unknown. */
  'unavailable',
] as const;

export type ExposureClass = (typeof EXPOSURE_CLASSES)[number];

export const EXPOSURE_CATEGORIES = [
  'phone',
  'personal-email',
  'home-address',
  'username',
  'identity-attribute',
  'other-contact',
] as const;

export type ExposureCategory = (typeof EXPOSURE_CATEGORIES)[number];

export const REMEDIATION_ACTIONS = [
  /** Jovie can execute removal directly. */
  'jovie-can-remove',
  /** Jovie can prepare/submit removal but a human completes consent/auth. */
  'jovie-can-prepare',
  /** Jovie can watch for recurrence but cannot act. */
  'monitor-only',
  /** Jovie can only inform the owner. */
  'inform-only',
] as const;

export type RemediationAction = (typeof REMEDIATION_ACTIONS)[number];

/**
 * Removal lifecycle. A submitted request is NOT a removal; `removed` is
 * reachable only via provider/source verification, and `recurred` is a
 * post-removal observation of the same exposure.
 */
export const REMOVAL_STATES = [
  'not-requested',
  'request-sent',
  'provider-acknowledged',
  'pending',
  'removed',
  'rejected',
  'recurred',
  'unknown',
] as const;

export type RemovalState = (typeof REMOVAL_STATES)[number];

const REMOVAL_TRANSITIONS: Record<RemovalState, readonly RemovalState[]> = {
  'not-requested': ['request-sent', 'unknown'],
  'request-sent': ['provider-acknowledged', 'pending', 'rejected', 'unknown'],
  'provider-acknowledged': ['pending', 'removed', 'rejected', 'unknown'],
  pending: ['removed', 'rejected', 'unknown'],
  removed: ['recurred'],
  rejected: ['request-sent', 'unknown'],
  recurred: ['request-sent', 'removed', 'unknown'],
  unknown: [
    'request-sent',
    'provider-acknowledged',
    'pending',
    'removed',
    'rejected',
  ],
};

export function canTransitionRemoval(
  from: RemovalState,
  to: RemovalState
): boolean {
  return REMOVAL_TRANSITIONS[from].includes(to);
}

export function assertRemovalTransition(
  from: RemovalState,
  to: RemovalState
): void {
  if (!canTransitionRemoval(from, to)) {
    throw new Error(`invalid removal transition: ${from} -> ${to}`);
  }
}

const VERIFIED_SUBJECT: unique symbol = Symbol('verified-subject');

/**
 * Opaque binding proving the subject's identity was verified and the listed
 * identifiers were owner-approved. Constructible only via
 * `bindVerifiedSubject`, so a scan cannot be planned for an unverified
 * subject or unapproved identifiers by construction.
 */
export interface VerifiedSubjectBinding {
  readonly [VERIFIED_SUBJECT]: true;
  readonly subjectId: string;
  readonly verifiedAt: string;
  readonly approvedIdentifierIds: readonly string[];
}

export function bindVerifiedSubject(input: {
  subjectId: string;
  verifiedAt: string | null;
  approvedIdentifierIds: readonly string[];
}): VerifiedSubjectBinding {
  if (!input.subjectId) {
    throw new Error('subjectId is required');
  }
  if (!input.verifiedAt) {
    throw new Error('subject identity must be verified before scanning');
  }
  if (input.approvedIdentifierIds.length === 0) {
    throw new Error('at least one owner-approved identifier is required');
  }
  return {
    [VERIFIED_SUBJECT]: true,
    subjectId: input.subjectId,
    verifiedAt: input.verifiedAt,
    approvedIdentifierIds: [...input.approvedIdentifierIds],
  };
}

export interface ApprovedIdentifier {
  readonly id: string;
  readonly category: ExposureCategory;
}

export interface ExposureScanTarget {
  readonly identifierId: string;
  readonly category: ExposureCategory;
  /** Providers may receive a hash/lookup token instead of the raw value. */
  readonly lookup: 'hashed' | 'raw';
}

/**
 * Plans which approved identifiers may be scanned. Identifiers not present
 * in the verified binding are rejected — the scan can never silently widen
 * beyond what the owner approved.
 */
export function planExposureScan(
  binding: VerifiedSubjectBinding,
  identifiers: readonly ApprovedIdentifier[],
  options: { providerSupportsHash: boolean }
): ExposureScanTarget[] {
  const approved = new Set(binding.approvedIdentifierIds);
  return identifiers.map(identifier => {
    if (!approved.has(identifier.id)) {
      throw new Error(
        `identifier ${identifier.id} is not approved for subject ${binding.subjectId}`
      );
    }
    return {
      identifierId: identifier.id,
      category: identifier.category,
      lookup: options.providerSupportsHash ? 'hashed' : 'raw',
    };
  });
}

/**
 * Minimal disclosure for the owner: enough to recognize which of their own
 * values is exposed, never the full value. Returns e.g. `••••••1234` or
 * `•••@example.com`.
 */
export function redactSensitiveValue(
  category: ExposureCategory,
  value: string
): string {
  if (category === 'personal-email') {
    const at = value.lastIndexOf('@');
    const domain = at >= 0 ? value.slice(at) : '';
    return `•••${domain}`;
  }
  const digits = value.replaceAll(/\D/g, '');
  const tail = digits.length >= 4 ? digits.slice(-4) : value.trim().slice(-4);
  return tail ? `••••••${tail}` : '••••••';
}

export interface ExposureFinding {
  readonly class: ExposureClass;
  readonly category: ExposureCategory;
  /** Redacted display value only — never the raw sensitive value. */
  readonly redactedValue: string;
  readonly sourceId: string;
  readonly observedAt: string;
  readonly confidence: 'verified' | 'likely' | 'ambiguous' | 'unknown';
  readonly remediation: RemediationAction;
  readonly removalState: RemovalState;
}

const SENSITIVE_MARKERS = /(@|\d{5,}|\d{3}[-. ]\d{3}[-. ]\d{4})/;

/**
 * Guard for telemetry/receipt sinks: a finding payload is safe only if its
 * redacted value does not still contain a raw phone run or email address.
 * Throws on violation so unsafe findings cannot be logged or shipped.
 */
export function assertTelemetrySafeFinding(finding: ExposureFinding): void {
  const value = finding.redactedValue;
  if (SENSITIVE_MARKERS.test(value.replaceAll('•', ''))) {
    throw new Error(
      `finding for ${finding.sourceId} carries an unredacted sensitive value`
    );
  }
}

export const REMEDIATION_PATHS = [
  'first-party-api',
  'automated-form',
  'vendor-agent',
  'human-handoff',
  'no-action',
] as const;

export type RemediationPath = (typeof REMEDIATION_PATHS)[number];

/** Safety rank: lower is always preferred over cost at equal safety. */
const PATH_SAFETY_RANK: Record<RemediationPath, number> = {
  'first-party-api': 0,
  'automated-form': 1,
  'vendor-agent': 2,
  'human-handoff': 3,
  'no-action': 4,
};

export interface RemediationCandidate {
  readonly path: RemediationPath;
  readonly providerId: string;
  /** Fully loaded per-removal cost (vendor fee + compute + ops). */
  readonly fullyLoadedCostCents: number;
  readonly requiresOwnerConsent: boolean;
  readonly supportsVerification: boolean;
}

export interface RemediationDecision {
  readonly path: RemediationPath;
  readonly providerId: string | null;
  readonly reason: string;
}

/**
 * Cheapest safe path: among candidates whose consent requirements are
 * satisfied, prefer the safest path class, then lowest fully loaded cost.
 * Providers are interchangeable — the decision returns an action, not a
 * vendor promise.
 */
export function selectRemediationPath(
  candidates: readonly RemediationCandidate[],
  context: { ownerConsentGranted: boolean }
): RemediationDecision {
  const eligible = candidates.filter(
    c => !c.requiresOwnerConsent || context.ownerConsentGranted
  );
  if (eligible.length === 0) {
    return {
      path: 'no-action',
      providerId: null,
      reason: context.ownerConsentGranted
        ? 'no remediation provider available'
        : 'all remediation paths require owner consent',
    };
  }
  const sorted = [...eligible].sort(
    (a, b) =>
      PATH_SAFETY_RANK[a.path] - PATH_SAFETY_RANK[b.path] ||
      a.fullyLoadedCostCents - b.fullyLoadedCostCents
  );
  const best = sorted[0];
  return {
    path: best.path,
    providerId: best.providerId,
    reason: 'cheapest safe path by fully loaded cost',
  };
}

/**
 * Recurrence check: an exposure previously verified `removed` that is
 * observed again at the same source transitions to `recurred`. Any other
 * combination leaves the state unchanged.
 */
export function detectRecurrence(
  current: RemovalState,
  observation: { sourceSeenAgain: boolean; observedAt: string }
): RemovalState {
  if (current === 'removed' && observation.sourceSeenAgain) {
    return 'recurred';
  }
  return current;
}
