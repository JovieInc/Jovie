/**
 * Canonical business-KPI registry (JOV-6057).
 *
 * `lib/analytics/metrics.ts` is the single source of truth for PROFILE
 * analytics metrics (views, clicks, followers). This module extends the same
 * contract to BUSINESS KPIs — signup, onboarding, profile claim, activation,
 * retention, conversion, subscription/revenue, funnel stages, feature usage,
 * and experiment/rollout exposure. It is the same registry pattern, not a
 * second metrics silo: identity, formula, durable source, version, owner.
 *
 * Two rules from the issue contract are enforced here (and by tests):
 *
 * 1. Durable authority — a KPI that claims money or activation may not be
 *    sourced from client-emitted events. Revenue KPIs must be anchored to a
 *    billing-provider receipt (Stripe webhook events); activation, signup,
 *    claim, and retention KPIs must be anchored to first-class DB rows or
 *    the server-side event ledger. Client events may inform a KPI but can
 *    never be its authority.
 *
 * 2. Qualification gate — autonomous optimization may only consume a KPI
 *    whose evidence carries provenance (definition version + authority) and
 *    freshness (as-of within the KPI's freshness SLA). `assertQualifiedForOptimization`
 *    fails closed on unqualified evidence.
 */

/** Contract version for this registry's shape; bump on breaking changes. */
export const BUSINESS_KPI_CONTRACT_VERSION =
  'analytics.business-kpis/v1' as const;

/** KPI family — the business-metric classes audited by JOV-6057. */
export type BusinessKpiFamily =
  | 'signup'
  | 'onboarding'
  | 'profile_claim'
  | 'activation'
  | 'retention'
  | 'conversion'
  | 'revenue'
  | 'funnel_stage'
  | 'feature_usage'
  | 'experiment_exposure';

/**
 * Durable source-of-truth class for a KPI's authority.
 *
 * - `client_event`: browser-emitted events — blockable by ad blockers and
 *   lost on navigation; never a durable authority for money or activation.
 * - `server_event`: `server_analytics_events` — server-observed, durable.
 * - `database`: first-class relational rows (users, creator_profiles, …).
 * - `billing_provider`: provider receipts (Stripe webhook events) — the only
 *   acceptable authority for revenue claims.
 */
export type KpiAuthority =
  | 'client_event'
  | 'server_event'
  | 'database'
  | 'billing_provider';

export interface CanonicalBusinessKpi {
  /** Human-readable canonical name. */
  readonly label: string;
  /** Precise plain-language definition of what counts. */
  readonly definition: string;
  readonly family: BusinessKpiFamily;
  /** Durable source-of-truth class producing this KPI. */
  readonly authority: KpiAuthority;
  /** Source table(s)/records the KPI reconciles to. */
  readonly source: string;
  /**
   * Idempotency/dedupe basis — the durable key (unique index, provider event
   * id, or row identity) that makes re-processing safe. Late, retried, or
   * out-of-order events must resolve through this key.
   */
  readonly dedupeKey: string;
  /** Owning team/persona accountable for this definition. */
  readonly owner: string;
  /** Max acceptable staleness of evidence for autonomous decisions. */
  readonly freshnessSlaHours: number;
  /** Definition version — carried on every piece of evidence for this KPI. */
  readonly version: string;
}

/** Every canonical business KPI key. */
export type BusinessKpiKey =
  | 'signups'
  | 'onboarding_completions'
  | 'profile_claims'
  | 'activated_creators'
  | 'retained_creators_28d'
  | 'free_to_paid_conversion'
  | 'active_subscriptions'
  | 'mrr'
  | 'lead_funnel_stage_transitions'
  | 'feature_usage_events'
  | 'experiment_exposures';

export const CANONICAL_BUSINESS_KPIS: Record<
  BusinessKpiKey,
  CanonicalBusinessKpi
> = {
  signups: {
    label: 'Signups',
    definition:
      'Users row created and not deleted (deleted_at IS NULL). Signup is claimed by the durable user record, not a client event.',
    family: 'signup',
    authority: 'database',
    source: 'users: COUNT(*) WHERE deleted_at IS NULL',
    dedupeKey: 'users.id (primary key)',
    owner: 'growth',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  onboarding_completions: {
    label: 'Onboarding Completions',
    definition:
      'Creators whose profile finished onboarding (onboarding_completed_at set).',
    family: 'onboarding',
    authority: 'database',
    source:
      'creator_profiles: COUNT(*) WHERE onboarding_completed_at IS NOT NULL',
    dedupeKey: 'creator_profiles.id (primary key)',
    owner: 'growth',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  profile_claims: {
    label: 'Profile Claims',
    definition:
      'Creator profiles bound to a user account (user_id IS NOT NULL). The claim fact is the durable ownership row, not the claim-flow client event.',
    family: 'profile_claim',
    authority: 'database',
    source: 'creator_profiles: COUNT(*) WHERE user_id IS NOT NULL',
    dedupeKey: 'creator_profiles.id / user_profile_claims claim id',
    owner: 'growth',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  activated_creators: {
    label: 'Activated Creators',
    definition:
      'Claimed creators with a complete public profile (display_name, avatar_url, username, spotify_url) — the conversion-funnel "profile complete" proxy for first value.',
    family: 'activation',
    authority: 'database',
    source:
      'creator_profiles: COUNT(*) WHERE user_id IS NOT NULL AND display_name IS NOT NULL AND avatar_url IS NOT NULL AND username IS NOT NULL AND spotify_url IS NOT NULL',
    dedupeKey: 'creator_profiles.id (primary key)',
    owner: 'growth',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  retained_creators_28d: {
    label: 'Retained Creators (28d)',
    definition:
      'Creators with server-observed activity on at least 2 distinct days within the trailing 28 days.',
    family: 'retention',
    authority: 'server_event',
    source:
      "server_analytics_events: COUNT(DISTINCT user) WHERE source_entity_type = 'user' AND occurred_at >= :now - 28d GROUP BY DISTINCT day",
    dedupeKey: 'server_analytics_events.id (primary key)',
    owner: 'growth',
    freshnessSlaHours: 48,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  free_to_paid_conversion: {
    label: 'Free→Paid Conversion',
    definition:
      'Users holding a Stripe subscription id on their durable user row. Conversion is claimed only when the subscription is provider-correlated.',
    family: 'conversion',
    authority: 'database',
    source:
      'users: COUNT(*) WHERE stripe_subscription_id IS NOT NULL AND deleted_at IS NULL',
    dedupeKey: 'users.stripe_subscription_id (unique)',
    owner: 'growth',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  active_subscriptions: {
    label: 'Active Subscriptions',
    definition:
      'Subscriptions confirmed active by Stripe webhook receipts — the provider is the authority, not local plan flags.',
    family: 'revenue',
    authority: 'billing_provider',
    source:
      'stripe_webhook_events (subscription lifecycle events) reconciled to users.stripe_subscription_id',
    dedupeKey: 'stripe_webhook_events.stripe_event_id (unique)',
    owner: 'billing',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  mrr: {
    label: 'MRR',
    definition:
      'Monthly recurring revenue across active subscriptions, from Stripe receipts. Must reconcile to provider invoice/charge events within tolerance.',
    family: 'revenue',
    authority: 'billing_provider',
    source:
      'stripe_webhook_events (invoice.paid / subscription amounts) reconciled to Stripe API truth',
    dedupeKey: 'stripe_webhook_events.stripe_event_id (unique)',
    owner: 'billing',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  lead_funnel_stage_transitions: {
    label: 'Lead Funnel Stage Transitions',
    definition:
      'Outbound/inbound funnel stage transitions recorded server-side per lead; each (lead, event_type) transition is recorded at most once.',
    family: 'funnel_stage',
    authority: 'database',
    source: 'lead_funnel_events: COUNT(*) GROUP BY event_type',
    dedupeKey:
      'lead_funnel_events unique index on (lead_id, event_type) — retries and out-of-order events resolve idempotently',
    owner: 'growth',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  feature_usage_events: {
    label: 'Feature Usage Events',
    definition:
      'Server-observed feature usage events from the typed server analytics ledger — client-tracked counts are corroborating, never authoritative.',
    family: 'feature_usage',
    authority: 'server_event',
    source: 'server_analytics_events: COUNT(*) GROUP BY event_name',
    dedupeKey: 'server_analytics_events.id (primary key)',
    owner: 'product',
    freshnessSlaHours: 48,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
  experiment_exposures: {
    label: 'Experiment/Flag Exposures',
    definition:
      'Experiment and feature-flag exposures attributable to an actual user, session, and flag/experiment version — anonymous or unattributed rows do not count.',
    family: 'experiment_exposure',
    authority: 'database',
    source:
      'feature_flag_audit_events / model_experiments joined to user/session attribution',
    dedupeKey:
      '(user_id, flag_or_experiment_key, variant/version) — repeat exposures dedupe to one attribution',
    owner: 'product',
    freshnessSlaHours: 24,
    version: BUSINESS_KPI_CONTRACT_VERSION,
  },
};

// ─── Authority rules ──────────────────────────────────────────────────────

/**
 * Families that make a money-or-activation claim. Their authority must be
 * durable (server/DB/provider); `client_event` is rejected by construction
 * here and by test.
 */
export const DURABLE_REQUIRED_FAMILIES: readonly BusinessKpiFamily[] = [
  'signup',
  'profile_claim',
  'activation',
  'retention',
  'conversion',
  'revenue',
];

const DURABLE_AUTHORITIES: ReadonlySet<KpiAuthority> = new Set([
  'server_event',
  'database',
  'billing_provider',
]);

/** True when `authority` is a durable (non-client) source of truth. */
export function isDurableAuthority(authority: KpiAuthority): boolean {
  return DURABLE_AUTHORITIES.has(authority);
}

/** True when this family's authority satisfies its durability requirement. */
export function hasValidAuthority(def: CanonicalBusinessKpi): boolean {
  if (def.family === 'revenue') return def.authority === 'billing_provider';
  if (DURABLE_REQUIRED_FAMILIES.includes(def.family))
    return isDurableAuthority(def.authority);
  return true;
}

// ─── Qualification gate (JOV-6057: unqualified KPIs cannot drive
//     autonomous decisions) ────────────────────────────────────────────────

export type KpiQualificationFailure =
  /** Evidence lacks provenance metadata entirely. */
  | 'missing_provenance'
  /** Evidence was produced by a different definition version. */
  | 'definition_version_mismatch'
  /** Evidence authority differs from the registered durable authority. */
  | 'authority_mismatch'
  /** Evidence as-of is older than the KPI's freshness SLA. */
  | 'stale_evidence'
  /** experiment_exposure evidence lacks user/session/version attribution. */
  | 'missing_attribution';

/** Provenance + freshness metadata that must accompany a KPI value. */
export interface KpiEvidenceMetadata {
  /** Definition version that produced the value (must match the registry). */
  readonly definitionVersion?: string;
  /** Authority class the value was actually computed from. */
  readonly authority?: KpiAuthority;
  /** Newest data instant reflected in the value. */
  readonly asOf?: Date | string;
  /** Required for experiment_exposure: real user + session/version. */
  readonly attribution?: {
    readonly userId?: string;
    readonly sessionId?: string;
    readonly version?: string;
  };
}

export interface KpiQualificationResult {
  readonly qualified: boolean;
  readonly failures: readonly KpiQualificationFailure[];
}

/**
 * Evaluate whether KPI evidence is qualified to drive an autonomous
 * optimization decision. Fails closed: any missing provenance, version or
 * authority mismatch, staleness beyond the freshness SLA, or missing
 * exposure attribution disqualifies the value.
 */
export function evaluateKpiQualification(
  key: BusinessKpiKey,
  evidence: KpiEvidenceMetadata | null | undefined,
  now: Date = new Date()
): KpiQualificationResult {
  const def = CANONICAL_BUSINESS_KPIS[key];
  const failures: KpiQualificationFailure[] = [];

  if (
    !evidence ||
    evidence.definitionVersion === undefined ||
    evidence.authority === undefined ||
    evidence.asOf === undefined
  ) {
    return { qualified: false, failures: ['missing_provenance'] };
  }

  if (evidence.definitionVersion !== def.version)
    failures.push('definition_version_mismatch');
  if (evidence.authority !== def.authority) failures.push('authority_mismatch');

  const asOfMs = new Date(evidence.asOf).getTime();
  if (
    !Number.isFinite(asOfMs) ||
    now.getTime() - asOfMs > def.freshnessSlaHours * 3_600_000
  ) {
    failures.push('stale_evidence');
  }

  if (def.family === 'experiment_exposure') {
    const a = evidence.attribution;
    if (!a?.userId || (!a.sessionId && !a.version))
      failures.push('missing_attribution');
  }

  return { qualified: failures.length === 0, failures };
}

/**
 * Gate for autonomous optimization: throws unless the KPI evidence is
 * qualified. Callers that catch should treat the value as unusable rather
 * than falling back to an unqualified number.
 */
export function assertQualifiedForOptimization(
  key: BusinessKpiKey,
  evidence: KpiEvidenceMetadata | null | undefined,
  now: Date = new Date()
): void {
  const { qualified, failures } = evaluateKpiQualification(key, evidence, now);
  if (!qualified) {
    throw new Error(
      `KPI '${key}' is not qualified for autonomous decisions: ${failures.join(', ')}`
    );
  }
}
