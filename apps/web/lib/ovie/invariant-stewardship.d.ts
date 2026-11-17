export const SOURCE_BOUND_SCHEMA: 'jovie-invariant-stewardship-audit/v2';

export interface StewardshipCausalEvent {
  readonly kind: string;
  readonly id: string;
  readonly sourceRevision: string;
}

export interface StewardshipFact {
  readonly id: string;
  readonly authority: { readonly owner: string; readonly approvedBy: string };
  readonly scope: {
    readonly products: readonly string[];
    readonly surfaces: readonly string[];
  };
  readonly policy: { readonly key: string; readonly value: unknown };
  readonly lifecycle: {
    readonly state: string;
    readonly supersedes: readonly string[];
    readonly supersededBy: string | null;
  };
  readonly source: { readonly ref: string; readonly digest: string };
  readonly [key: string]: unknown;
}

export interface StewardshipFinding {
  readonly id: string;
  readonly kind: 'duplicate' | 'conflicting';
  readonly candidateIds: readonly string[];
  readonly semanticKey: string;
  readonly canonicalOwners: readonly string[];
  readonly owner: string;
  readonly scope: {
    readonly products: readonly string[];
    readonly surfaces: readonly string[];
  };
  readonly evidence: readonly {
    readonly id: string;
    readonly owner: string;
    readonly ref: string;
    readonly digest: string;
  }[];
  readonly action:
    | 'regenerate-derived-projection'
    | 'explicit-decision-required';
}

export interface SourceBoundStewardshipAudit {
  readonly schemaVersion: typeof SOURCE_BOUND_SCHEMA;
  readonly generated: true;
  readonly authority: 'evidence-only';
  readonly generatedAt: string;
  readonly canonicalRegistry: { readonly path: string; readonly owner: string };
  readonly sourceBinding: { readonly path: string; readonly digest: string };
  readonly causalEvent: StewardshipCausalEvent;
  readonly facts: readonly StewardshipFact[];
  readonly declaredFindings: readonly StewardshipFinding[];
  readonly founderQueue: readonly never[];
}

export interface StewardshipSourceEvidence {
  readonly state: 'verified' | 'historical' | 'unknown' | 'stale' | 'invalid';
  readonly errors: readonly string[];
  readonly source: { readonly path: string; readonly digest: string | null };
  readonly executionStatus: 'not-certified';
  readonly remediation: string | null;
}

export interface StewardshipSourceEvaluation extends StewardshipSourceEvidence {
  readonly facts: readonly StewardshipFact[];
  readonly findings: readonly StewardshipFinding[];
}

export function regenerateStewardshipAudit(
  canonicalSource: string,
  options: {
    readonly causalEvent: StewardshipCausalEvent;
    readonly generatedAt: string;
  }
): SourceBoundStewardshipAudit;

export function evaluateStewardshipSources(
  audit: unknown,
  canonicalSource: string | null | undefined,
  options?: { readonly now?: Date }
): StewardshipSourceEvaluation;

export function projectStewardshipEvidence(
  audit: unknown,
  canonicalSource: string | null | undefined,
  options?: { readonly now?: Date }
): {
  readonly schemaVersion: string | null;
  readonly generatedAt: string | null;
  readonly window: unknown;
  readonly canonicalRegistry: {
    readonly path: string;
    readonly owner?: string;
  };
  readonly evidence: StewardshipSourceEvidence;
  readonly summary: {
    readonly candidates: number;
    readonly actionableExceptions: number;
    readonly founderDecisions: number;
    readonly sourceGaps: number;
  };
  readonly actionableExceptions: readonly StewardshipFinding[];
  readonly summerQueue: readonly StewardshipFinding[];
  readonly founderQueue: readonly never[];
  readonly drillDown: string;
};
