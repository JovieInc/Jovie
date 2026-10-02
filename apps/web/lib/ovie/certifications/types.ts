/**
 * Client-safe contract for the unified Ovie certification inventory
 * (`GET /api/ovie/certifications`). Server projection lives in
 * `inventory.server.ts`; the kernel (`lib/agent-os/certification.ts`) stays
 * the only authority for state, evidence digests, and founder decisions.
 */

import type { CertificationInboxQueue } from '@/lib/agent-os/certification-inbox';

export const OVIE_CERTIFICATION_INVENTORY_CONTRACT =
  'jovie.ovie-certification-inventory/v1' as const;

export const OVIE_CERTIFICATION_STATES = [
  'working',
  'review_ready',
  'founder_locked',
  'shipped',
  'monitored',
] as const;

export type OvieCertificationState = (typeof OVIE_CERTIFICATION_STATES)[number];

/** Taste tiers first, then operational tiers — the kernel's own order. */
export const OVIE_CERTIFICATION_TIERS = [
  'canonical_source',
  'invariant_evaluation',
  'tests_coverage',
  'visual_proof',
  'canonical_references',
  'required_variants',
  'ci',
  'queue_merge',
  'deploy',
  'runtime_dogfood',
] as const;

export type OvieCertificationTier = (typeof OVIE_CERTIFICATION_TIERS)[number];

export type OvieCertificationTierStatus =
  | 'passed'
  | 'failed'
  | 'pending'
  | 'missing';

export const OVIE_CERTIFICATION_DOMAINS = [
  'marketing_components',
  'customers',
  'flows',
  'public_profiles',
  'smart_links',
  'marketing',
  'lyb',
  'acquisition',
  'feature_registry',
] as const;

export type OvieCertificationDomainId =
  (typeof OVIE_CERTIFICATION_DOMAINS)[number];

export type OvieCertificationLinkKind =
  | 'screenshot'
  | 'test_run'
  | 'transcript'
  | 'pr'
  | 'doc'
  | 'other';

export interface OvieCertificationLink {
  readonly label: string;
  readonly href: string;
  readonly kind: OvieCertificationLinkKind;
}

export interface OvieCertificationEvidence {
  readonly id: string;
  readonly tier: OvieCertificationTier;
  readonly status: OvieCertificationTierStatus;
  readonly summary: string;
  /** Present only when the receipt ref is a navigable URL or repo path. */
  readonly href: string | null;
  readonly ref: string;
}

export interface OvieCertificationBlocker {
  readonly code: string;
  readonly tier: string;
  readonly summary: string;
}

export interface OvieCertificationHistoryEvent {
  readonly at: string;
  readonly kind: 'audit' | 'decision';
  readonly type: string;
  readonly summary: string;
  readonly actor: string | null;
}

export type OvieCertificationDecisionKind =
  | 'approved'
  | 'changes_requested'
  | 'rejected';

export interface OvieCertificationDecisionAvailability {
  readonly available: boolean;
  /** Human-readable reason when the founder actions are disabled. */
  readonly reason: string | null;
  /** Kernel evidence digest the decision must bind to. */
  readonly evidenceDigest: string | null;
  /**
   * The founder decision bound to the current evidence digest, if one exists.
   * Stale decisions recorded against older evidence never appear here.
   */
  readonly currentDecision: {
    readonly kind: OvieCertificationDecisionKind;
    readonly decidedAt: string;
    readonly reviewer: string;
    readonly notes: string | null;
  } | null;
}

export interface OvieCertificationRow {
  /** Stable across the whole inventory: `${domain}:${subjectId}`. */
  readonly id: string;
  readonly domain: OvieCertificationDomainId;
  readonly surface: string;
  readonly subject: {
    readonly id: string;
    readonly kind: string;
    readonly title: string;
  };
  readonly state: OvieCertificationState;
  readonly tiers: Readonly<
    Record<OvieCertificationTier, OvieCertificationTierStatus>
  >;
  readonly evidence: readonly OvieCertificationEvidence[];
  readonly blockers: readonly OvieCertificationBlocker[];
  /** A prior founder approval that no longer matches the current evidence. */
  readonly staleFounderLock: boolean;
  readonly updatedAt: string;
  readonly links: readonly OvieCertificationLink[];
  readonly history: readonly OvieCertificationHistoryEvent[];
  readonly decision: OvieCertificationDecisionAvailability;
  /**
   * Customers domain only (CERTIFICATION_V2_CUSTOMERS section 11): the
   * pipeline ranking fields. Absent on every other domain's row.
   */
  readonly rank?: number | null;
  readonly payScore?: number | null;
  readonly fitScore?: number | null;
  readonly heldFor?: readonly string[];
  readonly source: {
    readonly repository: string;
    readonly sha: string;
    readonly paths: readonly string[];
  } | null;
}

export type OvieCertificationDomainStatus =
  | 'connected'
  | 'empty'
  | 'not_connected'
  | 'error';

export interface OvieCertificationDomainSummary {
  readonly domain: OvieCertificationDomainId;
  readonly label: string;
  readonly status: OvieCertificationDomainStatus;
  readonly rowCount: number;
  /** Why a domain is empty, unconnected, or failed. Never a silent zero. */
  readonly note: string | null;
}

export interface OvieCertificationInventoryIssue {
  readonly domain: OvieCertificationDomainId | null;
  readonly source: string;
  readonly message: string;
}

export interface OvieCertificationInventory {
  readonly contract: typeof OVIE_CERTIFICATION_INVENTORY_CONTRACT;
  readonly generatedAt: string;
  /** Only the connected domains below; this is not a universal denominator. */
  readonly universal: false;
  readonly domains: readonly OvieCertificationDomainSummary[];
  readonly counts: Readonly<Record<OvieCertificationState, number>> & {
    readonly total: number;
  };
  /** Unified founder-judgment projection across every connected domain. */
  readonly queue: CertificationInboxQueue;
  readonly rows: readonly OvieCertificationRow[];
  readonly issues: readonly OvieCertificationInventoryIssue[];
}

export interface OvieCertificationDecisionRequest {
  readonly rowId: string;
  readonly evidenceDigest: string;
  readonly decision: OvieCertificationDecisionKind;
  readonly notes: string | null;
  /** Client-minted idempotency key; replay returns 409, never a second decision. */
  readonly actionId: string;
}

export const OVIE_CERTIFICATION_DOMAIN_LABELS: Readonly<
  Record<OvieCertificationDomainId, string>
> = {
  marketing_components: 'Marketing Components',
  customers: 'Customers',
  flows: 'Flows',
  public_profiles: 'Public Profiles',
  smart_links: 'Smart Links',
  marketing: 'Marketing',
  lyb: 'LYB',
  acquisition: 'Acquisition',
  feature_registry: 'Feature Registry',
};

export const OVIE_CERTIFICATION_STATE_LABELS: Readonly<
  Record<OvieCertificationState, string>
> = {
  working: 'Working',
  review_ready: 'Review Ready',
  founder_locked: 'Certified',
  shipped: 'Shipped',
  monitored: 'Monitored',
};

export const OVIE_CERTIFICATION_TIER_LABELS: Readonly<
  Record<OvieCertificationTier, string>
> = {
  canonical_source: 'Source',
  invariant_evaluation: 'Invariants',
  tests_coverage: 'Tests',
  visual_proof: 'Visual',
  canonical_references: 'References',
  required_variants: 'Variants',
  ci: 'CI',
  queue_merge: 'Merge',
  deploy: 'Deploy',
  runtime_dogfood: 'Dogfood',
};
