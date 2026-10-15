export const PARITY_STATUSES = [
  'documented',
  'implemented',
  'locally-tested',
  'deployed-verified',
  'missing',
  'access-blocked',
  'rights-blocked',
  'historical-coverage-gap',
  'vendor-only-opaque-metric',
] as const;

export type ParityStatus = (typeof PARITY_STATUSES)[number];

export type ParityVendor =
  | 'musicfetch'
  | 'chartmetric'
  | 'socialblade'
  | 'jovie';

export type EvidenceKind =
  | 'local-test'
  | 'deployed'
  | 'unsupported'
  | 'empty'
  | 'untested'
  | 'skipped'
  | 'inaccessible'
  | 'rights-blocked';

export interface Evidence {
  readonly kind: EvidenceKind;
  readonly ref: string;
}

export interface LeaseRecord {
  readonly issue: string;
  readonly prs: readonly number[];
  readonly files: readonly string[];
}

export interface Blocker {
  readonly failure: string;
  readonly owner: string;
  readonly reviewTrigger: string;
  readonly lease?: LeaseRecord;
}

/** A documented target, never evidence that the capability is implemented. */
export interface DocumentedContract {
  readonly family: string;
  readonly ownerIssue: string;
  readonly implementationIssue: string;
  readonly queryParameters: readonly string[];
  readonly source: {
    readonly url: string;
    readonly version: string;
    readonly retrievedOn: string;
    readonly sha256: string;
  };
  readonly caveat?: string;
}

export interface ParityRow {
  readonly id: string;
  readonly vendor: ParityVendor;
  readonly capability: string;
  readonly docUrl: string;
  readonly contract?: DocumentedContract;
  readonly status: ParityStatus;
  readonly evidence?: Evidence;
  readonly blocker?: Blocker;
}

export interface ScoreReport {
  readonly targetError?: string;
  readonly denominator: number;
  readonly passing: number;
  readonly unblockedFailures: readonly ParityRow[];
  readonly blocked: readonly ParityRow[];
  readonly exitCode: 0 | 1;
  readonly rows: readonly ParityRow[];
}

export type ProbeOutcome = 'passed' | 'failed' | 'skipped';

export interface ProbeResult {
  readonly id: string;
  readonly outcome: ProbeOutcome;
  readonly ref: string;
}

export type CatalogAdmission =
  | { readonly type: 'probe'; readonly probeId: string }
  | {
      readonly type: 'blocked';
      readonly status: ParityStatus;
      readonly blocker: Blocker;
    };

export interface CatalogEntry {
  readonly id: string;
  readonly vendor: ParityVendor;
  readonly capability: string;
  readonly docUrl: string;
  readonly contract?: DocumentedContract;
  readonly admission: CatalogAdmission;
}
