export const RELEASE_AUTOPILOT_MERCH_COMMAND = 'release_autopilot_merch_drop';

export interface ReleaseAutopilotMerchDropResult {
  readonly status: 'created' | 'existing' | 'skipped';
  readonly merchCardId: string | null;
  readonly generationId: string | null;
  readonly approvalStatus: 'needs_review' | null;
  readonly skippedReason?: string;
}

export interface ReleaseAutopilotRunResult {
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly merchDrop: ReleaseAutopilotMerchDropResult;
}

export interface ReleaseAutopilotRunInput {
  readonly profileId: string;
  readonly releaseId: string;
  readonly clerkUserId: string;
}
