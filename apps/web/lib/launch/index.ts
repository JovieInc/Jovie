import { createHash } from 'node:crypto';

export const LAUNCH_READ_MODEL_VERSION = 'launch-read-model/v1' as const;

export type LaunchSourceKind = 'jovie_capability' | 'artist_release';

export type LaunchAudience = 'public' | 'fans' | 'customers' | 'internal';

export type LaunchDecisionKind =
  | 'no_action'
  | 'doc_update'
  | 'changelog_notice'
  | 'tutorial_demo'
  | 'coordinated_launch';

export interface LaunchSourceRef {
  readonly kind: LaunchSourceKind;
  /** Stable source entity id: merged-PR key, release id, capability id. */
  readonly entityId: string;
  /** Exact source revision: merge SHA, release catalog revision, etc. */
  readonly revision: string;
}

export type LaunchEvidenceKind =
  | 'public_url'
  | 'deploy_receipt'
  | 'test'
  | 'pull_request'
  | 'provider_receipt'
  | 'analytics_event';

export interface LaunchEvidenceRef {
  readonly kind: LaunchEvidenceKind;
  /** Pointer to the canonical evidence (URL, receipt id, test path). */
  readonly ref: string;
}

/** A public claim is only allowed when bound to exact source evidence. */
export interface LaunchClaim {
  readonly statement: string;
  readonly evidence: readonly LaunchEvidenceRef[];
}

export interface LaunchAvailability {
  /** Verified merge is an input; public availability is a separate check. */
  readonly publiclyAvailable: boolean;
  /** Working user access verified at the surface, not inferred from deploy. */
  readonly userAccessVerified: boolean;
  readonly entitlementScope?: string;
  readonly verifiedAt?: string;
}

export interface LaunchDestination {
  /** Durable destination, e.g. canonical tutorial, changelog, release page. */
  readonly kind:
    | 'canonical_tutorial'
    | 'changelog'
    | 'blog_post'
    | 'release_page'
    | 'engineering_story';
  /** Canonical reference; never a duplicated editable body. */
  readonly canonicalRef: string;
}

export interface LaunchChannel {
  readonly id: string;
  readonly kind: 'social_post' | 'sms' | 'email' | 'blog' | 'press_pitch';
  /** Existing exact-copy/send approval or consent scope authorizing use. */
  readonly permissionRef: string;
  readonly audience: LaunchAudience;
}

export interface LaunchContentRevision {
  readonly contentRef: string;
  readonly revision: string;
  readonly certifiedAt?: string;
}

export type LaunchReceiptStatus =
  | 'prepared'
  | 'approved'
  | 'queued'
  | 'provider_accepted'
  | 'delivered';

export interface LaunchDeliveryReceipt {
  /** Provider-side or external observation id; never an internal mutation. */
  readonly externalId: string;
  readonly channel: string;
  readonly status: LaunchReceiptStatus;
  readonly observedAt: string;
}

export type LaunchOutcomeKind =
  | 'visited'
  | 'confirmed_subscription'
  | 'activated'
  | 'retained'
  | 'converted';

export interface LaunchOutcome {
  readonly kind: LaunchOutcomeKind;
  readonly count: number;
  readonly observationWindow: string;
  readonly observedAt: string;
}

export type LaunchStatus =
  | 'prepared'
  | 'approved'
  | 'queued'
  | 'provider_accepted'
  | 'delivered'
  | 'visited'
  | 'subscribed'
  | 'activated'
  | 'retained'
  | 'withdrawn'
  | 'retracted';

const STATUS_ORDER: Record<LaunchStatus, number> = {
  prepared: 0,
  approved: 1,
  queued: 2,
  provider_accepted: 3,
  delivered: 4,
  visited: 5,
  subscribed: 6,
  activated: 7,
  retained: 8,
  withdrawn: 99,
  retracted: 99,
};

export interface LaunchDecision {
  readonly kind: LaunchDecisionKind;
  readonly reason: string;
  readonly decidedAt: string;
}

export interface LaunchRecord {
  readonly launchId: string;
  readonly version: typeof LAUNCH_READ_MODEL_VERSION;
  readonly source: LaunchSourceRef;
  readonly audience: LaunchAudience;
  /** The audience job this launch serves, e.g. 'try the new smart link'. */
  readonly job: string;
  readonly claims: readonly LaunchClaim[];
  readonly availability: LaunchAvailability;
  readonly destination: LaunchDestination | null;
  readonly conversionEvent: string | null;
  readonly channels: readonly LaunchChannel[];
  readonly contentRevisions: readonly LaunchContentRevision[];
  readonly decision: LaunchDecision;
  readonly receipts: readonly LaunchDeliveryReceipt[];
  readonly outcomes: readonly LaunchOutcome[];
  readonly status: LaunchStatus;
  readonly statusNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LaunchDecisionInput {
  /** Verified merge/release event is the minimum input. */
  readonly verified: boolean;
  /** Internal refactors and patch releases are not material. */
  readonly material: boolean;
  readonly audienceEligible: boolean;
  readonly availability: LaunchAvailability;
  /** A durable destination and a permitted channel must both exist. */
  readonly hasDurableDestination: boolean;
  readonly hasPermittedChannel: boolean;
  /** True when the change teaches a repeatable task worth a tutorial. */
  readonly teachesTask?: boolean;
}

/**
 * Every material release gets a persisted decision with a reason. Internal
 * refactors and patch releases never create blog/tutorial clusters.
 */
export function decideLaunchAction(
  input: LaunchDecisionInput,
  decidedAt = new Date().toISOString()
): LaunchDecision {
  const decide = (
    kind: LaunchDecisionKind,
    reason: string
  ): LaunchDecision => ({
    kind,
    reason,
    decidedAt,
  });
  if (!input.verified) {
    return decide('no_action', 'source-not-verified');
  }
  if (!input.material) {
    return decide('no_action', 'internal-refactor-or-patch-release');
  }
  if (!input.availability.publiclyAvailable) {
    return decide('no_action', 'not-publicly-available');
  }
  if (!input.availability.userAccessVerified) {
    return decide('doc_update', 'public-access-not-yet-verified');
  }
  if (!input.audienceEligible) {
    return decide('changelog_notice', 'material-but-not-audience-eligible');
  }
  if (input.hasDurableDestination && input.hasPermittedChannel) {
    return decide(
      'coordinated_launch',
      'available-capability-with-durable-destination-and-permitted-channel'
    );
  }
  if (input.teachesTask) {
    return decide(
      'tutorial_demo',
      'repeatable-task-without-coordinated-channel'
    );
  }
  return decide(
    'changelog_notice',
    'no-durable-destination-or-permitted-channel'
  );
}

export function launchIdForSource(source: LaunchSourceRef): string {
  const hash = createHash('sha256')
    .update(`${source.kind}|${source.entityId}|${source.revision}`)
    .digest('hex')
    .slice(0, 24);
  return `launch-${hash}`;
}

export interface CommissionLaunchInput {
  readonly source: LaunchSourceRef;
  readonly audience: LaunchAudience;
  readonly job: string;
  readonly decision: LaunchDecision;
  readonly claims?: readonly LaunchClaim[];
  readonly availability: LaunchAvailability;
  readonly destination?: LaunchDestination | null;
  readonly conversionEvent?: string | null;
  readonly channels?: readonly LaunchChannel[];
  readonly contentRevisions?: readonly LaunchContentRevision[];
}

function assertClaimsHaveEvidence(claims: readonly LaunchClaim[]): void {
  for (const claim of claims) {
    if (claim.evidence.length === 0) {
      throw new Error('launch claims must reference source evidence');
    }
  }
}

/**
 * Read-model store for launches. Commissioning is idempotent on
 * (source.kind, source.entityId, source.revision): retries and replays
 * return the existing record and can never double-post or fork a launch.
 */
export class InMemoryLaunchRegistry {
  private readonly launches = new Map<string, LaunchRecord>();

  async commission(input: CommissionLaunchInput): Promise<LaunchRecord> {
    const launchId = launchIdForSource(input.source);
    const existing = this.launches.get(launchId);
    if (existing) return existing;
    const claims = input.claims ?? [];
    assertClaimsHaveEvidence(claims);
    if (input.decision.kind === 'coordinated_launch') {
      if (!input.destination) {
        throw new Error('coordinated launches require a durable destination');
      }
      if (!input.channels || input.channels.length === 0) {
        throw new Error('coordinated launches require a permitted channel');
      }
    }
    const now = new Date().toISOString();
    const record: LaunchRecord = {
      launchId,
      version: LAUNCH_READ_MODEL_VERSION,
      source: input.source,
      audience: input.audience,
      job: input.job,
      claims,
      availability: input.availability,
      destination: input.destination ?? null,
      conversionEvent: input.conversionEvent ?? null,
      channels: input.channels ?? [],
      contentRevisions: input.contentRevisions ?? [],
      decision: input.decision,
      receipts: [],
      outcomes: [],
      status: 'prepared',
      statusNote: null,
      createdAt: now,
      updatedAt: now,
    };
    this.launches.set(launchId, record);
    return record;
  }

  async get(launchId: string): Promise<LaunchRecord | null> {
    return this.launches.get(launchId) ?? null;
  }

  /**
   * Delivery receipts carry an external/provider observation id; an internal
   * status mutation is never accepted as external-delivery proof.
   */
  async recordReceipt(
    launchId: string,
    receipt: LaunchDeliveryReceipt
  ): Promise<LaunchRecord> {
    const launch = this.require(launchId);
    if (!receipt.externalId) {
      throw new Error('delivery receipts require an external observation id');
    }
    if (
      launch.receipts.some(
        existing => existing.externalId === receipt.externalId
      )
    ) {
      return launch;
    }
    return this.update(launchId, current => ({
      ...current,
      receipts: [...current.receipts, receipt],
      status: advanceStatus(current.status, receipt.status),
    }));
  }

  async recordOutcome(
    launchId: string,
    outcome: LaunchOutcome
  ): Promise<LaunchRecord> {
    const status: LaunchStatus =
      outcome.kind === 'visited'
        ? 'visited'
        : outcome.kind === 'confirmed_subscription'
          ? 'subscribed'
          : outcome.kind === 'activated'
            ? 'activated'
            : outcome.kind === 'retained'
              ? 'retained'
              : 'activated';
    return this.update(launchId, current => ({
      ...current,
      outcomes: [...current.outcomes, outcome],
      status: advanceStatus(current.status, status),
    }));
  }

  /** Withdraw availability or retract a changed claim with a reason. */
  async annotate(
    launchId: string,
    status: 'withdrawn' | 'retracted',
    note: string
  ): Promise<LaunchRecord> {
    if (!note) throw new Error('withdraw/retract requires a note');
    return this.update(launchId, current => ({
      ...current,
      status,
      statusNote: note,
    }));
  }

  private require(launchId: string): LaunchRecord {
    const launch = this.launches.get(launchId);
    if (!launch) throw new Error(`unknown launch ${launchId}`);
    return launch;
  }

  private update(
    launchId: string,
    mutate: (current: LaunchRecord) => LaunchRecord
  ): LaunchRecord {
    const next = {
      ...mutate(this.require(launchId)),
      updatedAt: new Date().toISOString(),
    };
    this.launches.set(launchId, next);
    return next;
  }
}

function advanceStatus(
  current: LaunchStatus,
  next: LaunchStatus
): LaunchStatus {
  if (current === 'withdrawn' || current === 'retracted') return current;
  return STATUS_ORDER[next] > STATUS_ORDER[current] ? next : current;
}
