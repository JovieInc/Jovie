/**
 * Canonical owner-scoped finance domain (JOV-4610).
 *
 * This module is safe to import from server and client code. It defines data
 * shape and policy only: no database, auth, provider, or creator dependency is
 * allowed here. The sole authorization root is the authenticated `users.id`.
 */

export const FINANCE_DOMAIN_VERSION = 'finance-domain/v1' as const;

export const FINANCE_ENTITY_IDS = [
  'financial_owner',
  'provider_connection',
  'consent_event',
  'institution',
  'account',
  'balance_snapshot',
  'transaction',
  'transaction_split',
  'transfer_pair',
  'refund',
  'adjustment',
  'classification',
  'classification_correction',
  'classification_rule',
  'budget',
  'budget_settings',
  'sustainability_target',
  'metric_snapshot',
  'comparison_window',
  'forecast_assumption',
  'scenario',
  'deletion_request',
  'export',
  'audit_event',
] as const;

export type FinanceEntityId = (typeof FINANCE_ENTITY_IDS)[number];

export const FINANCE_RETENTION_CLASSES = [
  'owner_lifetime',
  'revocable_secret',
  'consent_evidence',
  'derived_rebuildable',
  'expiring_artifact',
  'redacted_audit',
] as const;

export type FinanceRetentionClass = (typeof FINANCE_RETENTION_CLASSES)[number];

export interface FinanceRelationshipDefinition {
  readonly field: string;
  readonly parent: FinanceEntityId;
  /** Requires `(owner_user_id, parent_id)` to reference the same owner. */
  readonly sameOwner: true;
}

export interface FinanceEntityDefinition {
  readonly id: FinanceEntityId;
  readonly storage: string;
  readonly ownerPath: 'users.id' | 'owner_user_id -> users.id';
  readonly authorizationPrincipal: 'authenticated_individual';
  readonly relationships: readonly FinanceRelationshipDefinition[];
  readonly retention: FinanceRetentionClass;
  readonly appendOnly: boolean;
}

const relation = (
  field: string,
  parent: FinanceEntityId
): FinanceRelationshipDefinition => ({ field, parent, sameOwner: true });

interface EntityOptions {
  readonly appendOnly?: boolean;
  readonly ownerPath?: FinanceEntityDefinition['ownerPath'];
  readonly relationships?: readonly FinanceRelationshipDefinition[];
}

const entity = <Id extends FinanceEntityId>(
  id: Id,
  storage: string,
  retention: FinanceRetentionClass,
  options: EntityOptions = {}
): FinanceEntityDefinition & { readonly id: Id } => ({
  id,
  storage,
  ownerPath: options.ownerPath ?? 'owner_user_id -> users.id',
  authorizationPrincipal: 'authenticated_individual',
  relationships: options.relationships ?? [],
  retention,
  appendOnly: options.appendOnly ?? false,
});

/**
 * Executable relationship design. Every finance table carries
 * `owner_user_id`; parent links additionally require a composite same-owner
 * foreign key so a guessed id cannot create a cross-owner relationship.
 */
export const FINANCE_ENTITY_DEFINITIONS = {
  financial_owner: entity('financial_owner', 'users', 'owner_lifetime', {
    ownerPath: 'users.id',
  }),
  provider_connection: entity(
    'provider_connection',
    'finance_provider_connections',
    'revocable_secret'
  ),
  consent_event: entity(
    'consent_event',
    'finance_consent_events',
    'consent_evidence',
    {
      appendOnly: true,
      relationships: [relation('connection_id', 'provider_connection')],
    }
  ),
  institution: entity('institution', 'finance_institutions', 'owner_lifetime', {
    relationships: [relation('connection_id', 'provider_connection')],
  }),
  account: entity('account', 'finance_accounts', 'owner_lifetime', {
    relationships: [relation('institution_id', 'institution')],
  }),
  balance_snapshot: entity(
    'balance_snapshot',
    'finance_balance_snapshots',
    'owner_lifetime',
    { appendOnly: true, relationships: [relation('account_id', 'account')] }
  ),
  transaction: entity('transaction', 'finance_transactions', 'owner_lifetime', {
    relationships: [relation('account_id', 'account')],
  }),
  transaction_split: entity(
    'transaction_split',
    'finance_transaction_splits',
    'owner_lifetime',
    { relationships: [relation('transaction_id', 'transaction')] }
  ),
  transfer_pair: entity(
    'transfer_pair',
    'finance_transfer_pairs',
    'owner_lifetime',
    {
      relationships: [
        relation('outflow_transaction_id', 'transaction'),
        relation('inflow_transaction_id', 'transaction'),
      ],
    }
  ),
  refund: entity('refund', 'finance_refunds', 'owner_lifetime', {
    relationships: [
      relation('refund_transaction_id', 'transaction'),
      relation('original_transaction_id', 'transaction'),
    ],
  }),
  adjustment: entity('adjustment', 'finance_adjustments', 'owner_lifetime', {
    appendOnly: true,
    relationships: [relation('transaction_id', 'transaction')],
  }),
  classification: entity(
    'classification',
    'finance_transaction_classifications',
    'owner_lifetime',
    { relationships: [relation('transaction_id', 'transaction')] }
  ),
  classification_correction: entity(
    'classification_correction',
    'finance_classification_corrections',
    'owner_lifetime',
    {
      appendOnly: true,
      relationships: [relation('classification_id', 'classification')],
    }
  ),
  classification_rule: entity(
    'classification_rule',
    'finance_classification_rules',
    'owner_lifetime'
  ),
  budget: entity('budget', 'finance_budget_targets', 'owner_lifetime'),
  budget_settings: entity(
    'budget_settings',
    'finance_budget_settings',
    'owner_lifetime'
  ),
  sustainability_target: entity(
    'sustainability_target',
    'finance_sustainability_targets',
    'owner_lifetime'
  ),
  metric_snapshot: entity(
    'metric_snapshot',
    'finance_metric_snapshots',
    'derived_rebuildable',
    {
      appendOnly: true,
      relationships: [relation('comparison_window_id', 'comparison_window')],
    }
  ),
  comparison_window: entity(
    'comparison_window',
    'finance_comparison_windows',
    'derived_rebuildable',
    { appendOnly: true }
  ),
  forecast_assumption: entity(
    'forecast_assumption',
    'finance_forecast_assumptions',
    'owner_lifetime',
    { relationships: [relation('scenario_id', 'scenario')] }
  ),
  scenario: entity('scenario', 'finance_scenarios', 'owner_lifetime', {
    relationships: [relation('baseline_metric_snapshot_id', 'metric_snapshot')],
  }),
  deletion_request: entity(
    'deletion_request',
    'finance_deletion_requests',
    'redacted_audit',
    { appendOnly: true }
  ),
  export: entity('export', 'finance_exports', 'expiring_artifact'),
  audit_event: entity('audit_event', 'finance_audit_events', 'redacted_audit', {
    appendOnly: true,
  }),
} as const satisfies Readonly<Record<FinanceEntityId, FinanceEntityDefinition>>;

export type FinanceSourceKind =
  | 'derived'
  | 'deterministic_rule'
  | 'owner'
  | 'provider'
  | 'system';

export interface FinanceProvenance {
  readonly source: FinanceSourceKind;
  /** Hash or provider-opaque reference; never a raw provider payload. */
  readonly sourceRef?: string;
  readonly connectionId?: string;
  readonly syncRunId?: string;
  readonly inputRecordIds: readonly string[];
  readonly observedAt: string;
  readonly definitionVersion?: string;
}

export interface OwnerScopedFinanceRecord {
  readonly id: string;
  /** Authenticated `users.id`; creator/workspace identity is never accepted. */
  readonly ownerUserId: string;
  readonly createdAt: string;
  readonly provenance: FinanceProvenance;
}

export const FINANCE_CATEGORIES = [
  'personal_income',
  'creator_income',
  'personal_essential',
  'personal_discretionary',
  'creator_operating',
  'creator_investment',
  'tax_reserve',
  'internal_transfer',
  'credit_card_payment',
  'debt_principal',
  'reimbursement',
  'cash_withdrawal',
  'excluded',
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];
export type FinanceClassificationSource =
  | 'deterministic_default'
  | 'owner_correction'
  | 'owner_rule'
  | 'provider_hint'
  | 'unclassified';

export interface FinanceAccountContract extends OwnerScopedFinanceRecord {
  readonly institutionId: string;
  readonly kind: 'asset' | 'liability';
  readonly subtype:
    | 'cash'
    | 'checking'
    | 'credit_card'
    | 'loan'
    | 'savings'
    | 'other';
  readonly currency: string;
  readonly includeInCash: boolean;
}

export interface FinanceBalanceSnapshotContract
  extends OwnerScopedFinanceRecord {
  readonly accountId: string;
  readonly asOf: string;
  readonly currentMinor: number;
  readonly availableMinor: number | null;
  readonly currency: string;
}

export interface FinanceTransactionContract extends OwnerScopedFinanceRecord {
  readonly accountId: string;
  readonly status: 'pending' | 'posted' | 'removed';
  /** Signed minor units: inflow positive, outflow negative. */
  readonly amountMinor: number;
  readonly currency: string;
  readonly authorizedAt: string | null;
  readonly postedAt: string | null;
}

export interface FinanceClassificationContract
  extends OwnerScopedFinanceRecord {
  readonly transactionId: string;
  readonly splitId?: string;
  readonly category: FinanceCategory;
  /** Integer in [0, 10_000]. */
  readonly confidenceBps: number;
  readonly source: FinanceClassificationSource;
  readonly ruleId?: string;
}

export type FinanceLifecycleStatus =
  | 'completed'
  | 'failed'
  | 'pending'
  | 'processing'
  | 'revoked';

/**
 * Retention is event-driven. Source and derived rows live only while the owner
 * retains them; secrets are destroyed on revocation; exports require an
 * `expiresAt`; audit rows contain redacted digests and their own expiry.
 */
export interface FinanceLifecycleContract extends OwnerScopedFinanceRecord {
  readonly status: FinanceLifecycleStatus;
  readonly requestedAt: string;
  readonly completedAt: string | null;
  readonly expiresAt: string | null;
  readonly redactedReceiptHash: string | null;
}
