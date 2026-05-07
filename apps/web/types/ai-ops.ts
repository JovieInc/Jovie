export type HermesAiOpsSource =
  | 'github'
  | 'linear'
  | 'sentry'
  | 'hermes'
  | 'ci';

export type HermesAiOpsKind =
  | 'triage'
  | 'bug_patch'
  | 'code_review'
  | 'qa'
  | 'investigation'
  | 'support_draft'
  | 'issue'
  | 'pr'
  | 'workflow'
  | 'blocker'
  | 'recommendation';

export type HermesAiOpsStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'review'
  | 'done'
  | 'failed'
  | 'stale';

export type HermesAiOpsAvailability =
  | 'available'
  | 'partial'
  | 'not_configured'
  | 'error';

export interface HermesAiOpsItem {
  readonly source: HermesAiOpsSource;
  readonly kind: HermesAiOpsKind;
  readonly status: HermesAiOpsStatus;
  readonly priority: number;
  readonly url: string | null;
  readonly owner: string | null;
  readonly summary: string;
  readonly updatedAt: string;
}

export interface HermesAiOpsCounts {
  readonly queued: number;
  readonly running: number;
  readonly blocked: number;
  readonly review: number;
  readonly done: number;
  readonly failed: number;
  readonly stale: number;
}

export type HermesCliRuntime = 'codex-cli' | 'claude-code' | 'ruflo';

export interface HermesDispatchAvailability {
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly runtimes: readonly HermesCliRuntime[];
}

export interface HermesAiOpsSourceStatus {
  readonly availability: Exclude<HermesAiOpsAvailability, 'partial'>;
  readonly configured: boolean;
  readonly itemCount: number;
  readonly errorMessage?: string;
}

export interface HermesAiOpsMergeQueue {
  readonly openAgentPrs: number;
  readonly openAgentPrThreshold: number;
  readonly pressure: 'normal' | 'elevated' | 'high';
}

export interface HermesAiOpsSummary {
  readonly availability: HermesAiOpsAvailability;
  readonly generatedAtIso: string;
  readonly counts: HermesAiOpsCounts;
  readonly dispatch: HermesDispatchAvailability;
  readonly mergeQueue: HermesAiOpsMergeQueue;
  readonly runs: HermesAiOpsItem[];
  readonly blockers: HermesAiOpsItem[];
  readonly recommendations: HermesAiOpsItem[];
  readonly sources: Record<HermesAiOpsSource, HermesAiOpsSourceStatus>;
  readonly errorMessage?: string;
}

export interface HermesDispatchRequest {
  readonly source: HermesAiOpsSource;
  readonly sourceId?: string;
  readonly sourceUrl?: string | null;
  readonly kind: Extract<
    HermesAiOpsKind,
    | 'triage'
    | 'bug_patch'
    | 'code_review'
    | 'qa'
    | 'investigation'
    | 'support_draft'
  >;
  readonly runtime: HermesCliRuntime;
  readonly priority?: number;
  readonly skills?: readonly string[];
  readonly allowedPaths?: readonly string[];
  readonly verification?: readonly string[];
  readonly dryRun?: boolean;
  readonly prompt?: string;
  readonly owner?: string | null;
}

export interface HermesDispatchPayload extends HermesDispatchRequest {
  readonly dispatchId: string;
  readonly sourceId: string;
  readonly sourceUrl: string | null;
  readonly priority: number;
  readonly skills: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly verification: readonly string[];
  readonly dryRun: boolean;
  readonly prompt: string;
  readonly owner: string | null;
  readonly branchName: string;
  readonly requestedAt: string;
}

export interface HermesDispatchResult {
  readonly dispatchId: string;
  readonly branchName: string;
  readonly eventType: 'hermes_cli_worker';
  readonly dryRun: boolean;
}
