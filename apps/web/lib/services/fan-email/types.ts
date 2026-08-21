/** Fan-email no-invent + human-send types for `fan_email_send`. */

export type FanEmailClaimKey =
  | 'openRate'
  | 'clickRate'
  | 'listSize'
  | 'scarcity'
  | 'deadline';

export type FanEmailSendIntent =
  | 'auto_send'
  | 'schedule'
  | 'draft'
  | 'queue_for_approval';

export type FanEmailDisposition = 'draft' | 'queue_for_approval' | 'skip';

export interface RetrievedEspMetrics {
  readonly listSize?: number | null;
  readonly openRate?: number | null;
  readonly clickRate?: number | null;
  readonly scarcityCount?: number | null;
  readonly deadline?: string | null;
  readonly observedAt?: string | null;
}

export interface RetrievedSmartLink {
  readonly url?: string | null;
  readonly live?: boolean | null;
}

export interface FanEmailDraft {
  readonly subject?: string;
  readonly body?: string;
  readonly ctaUrl?: string | null;
  readonly testimonials?: readonly string[] | null;
  readonly claimedOpenRate?: number | null;
  readonly claimedClickRate?: number | null;
  readonly claimedListSize?: number | null;
  readonly claimedScarcity?: string | number | null;
  readonly claimedDeadline?: string | null;
}

export interface FanEmailSendInput {
  readonly retrieved?: RetrievedEspMetrics | null;
  readonly smartLink?: RetrievedSmartLink | null;
  readonly draft?: FanEmailDraft | null;
  readonly sendIntent?: FanEmailSendIntent | null;
  readonly humanSignOff?: boolean | null;
}

export type GateFanEmailSendInput = FanEmailSendInput;

export interface GatedFanEmailCopy {
  readonly subject: string;
  readonly body: string;
  readonly ctaUrl: string | null;
  readonly ctaCount: number;
  readonly omittedClaims: readonly FanEmailClaimKey[];
}

export interface FanEmailGateResult {
  readonly disposition: FanEmailDisposition;
  readonly skipReason: string | null;
  readonly runSucceeded: boolean;
  readonly queued: boolean;
  readonly sent: boolean;
  readonly scheduled: boolean;
  readonly copy: GatedFanEmailCopy;
  readonly unverifiable: readonly FanEmailClaimKey[];
}
