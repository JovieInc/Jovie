export type HudEnvExceptionKind = 'vercel-preview' | 'neon-branch';

export type HudEnvCleanupState =
  | 'admitted'
  | 'cleanup-pending'
  | 'cleaned'
  | 'orphaned';

export interface HudEnvExceptionLane {
  readonly id: string;
  readonly kind: string;
  readonly policy: string;
  readonly owner: string;
  readonly surface: string;
  readonly evidencePurpose: string;
  readonly ttlHours: number | null;
  readonly cleanupTrigger: string;
  readonly costBudget: string;
}

export interface HudEnvActiveException {
  readonly id: string;
  readonly kind: string;
  readonly workId: string | null;
  /** Full SHA is kept in the payload; display layers may shorten it. */
  readonly sha: string | null;
  readonly owner: string | null;
  readonly reason: string | null;
  /** Evidence purpose stated at admission time. */
  readonly requiredEvidence: string | null;
  readonly environment: string | null;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
  readonly ageMs: number | null;
  readonly expiresInMs: number | null;
  readonly expired: boolean;
  readonly countsAsEvidence: boolean;
  readonly cleanupState: string;
  readonly costBudget: string | null;
  readonly blocker: boolean;
  readonly blockerReason: string | null;
}

export interface HudEnvExceptionsPayload {
  readonly schema: string;
  readonly generatedAt: string | null;
  readonly updatedBy: string | null;
  readonly lanes: readonly HudEnvExceptionLane[];
  readonly activeExceptions: readonly HudEnvActiveException[];
}
