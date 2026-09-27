/**
 * Semantic-contract primitive for canonical admission. JOV-5922
 *
 * A value satisfying its storage type is not sufficient for canonical
 * admission. Every canonical field has a versioned contract covering shape,
 * normalization, provenance, plausibility, and allowed uncertainty. Values
 * that fail are quarantined — the raw observation and its provenance are
 * returned to the caller so it can record a candidate/rejected state or
 * escalate, never silently coerced into canon.
 *
 * Contracts are pure and deterministic: `admit` never reads or writes the
 * database. Producers call `admit` at the earliest shared canonical write
 * boundary and decide how to persist or escalate the quarantine decision.
 * Use `requireCanonical` where a write boundary must fail closed.
 */

/** How the observed value reached the producer. */
export type CanonicalConfidence =
  | 'observed'
  | 'inferred'
  | 'imported'
  | 'user_certified'
  | 'unknown';

export interface CanonicalProvenance {
  /** Producer pipeline and version, e.g. 'collaborator-profile-reconciliation@1'. */
  readonly producer: string;
  /** Source platform or system that supplied the raw value (e.g. 'spotify'). */
  readonly source?: string;
  readonly confidence?: CanonicalConfidence;
}

export interface ContractRejection {
  /** Machine-stable reason code, e.g. 'serialized_collection'. */
  readonly code: string;
  readonly detail: string;
}

export type AdmissionStatus = 'accepted' | 'quarantined';

export interface AdmissionDecision<T> {
  readonly field: string;
  readonly contractVersion: number;
  readonly status: AdmissionStatus;
  /** The admitted canonical value. Present only when status is 'accepted'. */
  readonly canonical?: T;
  /** Why the observation was quarantined. Empty when accepted. */
  readonly rejections: readonly ContractRejection[];
  readonly provenance: CanonicalProvenance;
}

export type ContractEvaluation<T> =
  | { readonly ok: true; readonly canonical: T }
  | { readonly ok: false; readonly rejections: readonly ContractRejection[] };

export interface SemanticContract<T> {
  /** Canonical field this contract governs, e.g. 'creator_profiles.username'. */
  readonly field: string;
  /** Monotonic contract version; bump when admission rules change. */
  readonly version: number;
  /** Owning surface/team responsible for the contract. */
  readonly owner: string;
  /**
   * Evaluate a raw observation. Pure and deterministic — the same
   * (raw, provenance) pair always produces the same decision.
   */
  admit(raw: unknown, provenance: CanonicalProvenance): AdmissionDecision<T>;
}

export function defineSemanticContract<T>(definition: {
  readonly field: string;
  readonly version: number;
  readonly owner: string;
  readonly evaluate: (
    raw: unknown,
    provenance: CanonicalProvenance
  ) => ContractEvaluation<T>;
}): SemanticContract<T> {
  const { field, version, owner, evaluate } = definition;
  return {
    field,
    version,
    owner,
    admit(raw, provenance) {
      const result = evaluate(raw, provenance);
      if (result.ok) {
        return {
          field,
          contractVersion: version,
          status: 'accepted',
          canonical: result.canonical,
          rejections: [],
          provenance,
        };
      }
      return {
        field,
        contractVersion: version,
        status: 'quarantined',
        rejections: result.rejections,
        provenance,
      };
    },
  };
}

/** Thrown by `requireCanonical` when an observation is quarantined. */
export class SemanticContractError extends Error {
  readonly decision: AdmissionDecision<unknown>;

  constructor(decision: AdmissionDecision<unknown>) {
    super(
      `Canonical admission rejected for ${decision.field} ` +
        `(contract v${decision.contractVersion}): ` +
        decision.rejections.map(r => r.code).join(', ')
    );
    this.name = 'SemanticContractError';
    this.decision = decision;
  }
}

/**
 * Fail-closed admission for write boundaries that cannot store a
 * quarantine/candidate row. Returns the canonical value or throws
 * `SemanticContractError` carrying the full decision for logging/metrics.
 */
export function requireCanonical<T>(
  contract: SemanticContract<T>,
  raw: unknown,
  provenance: CanonicalProvenance
): T {
  const decision = contract.admit(raw, provenance);
  if (decision.status !== 'accepted' || decision.canonical === undefined) {
    throw new SemanticContractError(decision);
  }
  return decision.canonical;
}
