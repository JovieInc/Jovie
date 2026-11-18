import type { waitlistStatusEnum } from '@/lib/db/schema/enums';

export type WaitlistStatus = (typeof waitlistStatusEnum.enumValues)[number];

export const WAITLIST_PENDING_STATUSES = new Set<WaitlistStatus>([
  'new',
  'chat_started',
  'qualified',
  'queued',
  'waitlisted',
]);

export const WAITLIST_APPROVED_STATUSES = new Set<WaitlistStatus>([
  'invited',
  'approved',
  'claimed',
  'signed_up',
]);

export const WAITLIST_SIGNUP_ELIGIBLE_STATUSES = new Set<WaitlistStatus>([
  'invited',
  'approved',
  'claimed',
]);

export const WAITLIST_TERMINAL_STATUSES = new Set<WaitlistStatus>([
  'signed_up',
  'rejected',
  'expired',
  'blocked',
]);

/**
 * Mom Test funnel (qualify/2026-11-v1).
 *
 * - `queued` — held because of OUR readiness or capacity (golden path not
 *   green, capacity full, auto-accept off, high-profile verification). It is
 *   NOT a disqualification; it clears to qualified/approved when readiness
 *   does.
 * - `disqualified` — not a fit, with a reason. `waitlisted` is reachable only
 *   from here (collect their needs, waitlist them, move on).
 */
export const WAITLIST_HELD_STATUSES = new Set<WaitlistStatus>(['queued']);
export const WAITLIST_DISQUALIFIED_STATUSES = new Set<WaitlistStatus>([
  'disqualified',
]);

const ALLOWED_TRANSITIONS: Record<WaitlistStatus, readonly WaitlistStatus[]> = {
  new: [
    'qualified',
    'queued',
    'disqualified',
    'invited',
    'approved',
    'rejected',
    'blocked',
  ],
  chat_started: ['qualified', 'queued', 'disqualified', 'blocked'],
  qualified: ['approved', 'queued', 'disqualified', 'rejected', 'blocked'],
  queued: ['qualified', 'approved', 'disqualified', 'rejected', 'blocked'],
  disqualified: ['waitlisted', 'qualified', 'rejected', 'blocked'],
  waitlisted: ['invited', 'approved', 'rejected', 'blocked'],
  invited: ['approved', 'signed_up', 'expired', 'blocked'],
  approved: ['signed_up', 'expired', 'blocked'],
  claimed: ['signed_up', 'blocked'],
  signed_up: [],
  rejected: [],
  expired: ['waitlisted', 'invited'],
  blocked: [],
};

/** Statuses whose entry requires a `decisionReason`. */
const REQUIRES_DECISION_REASON = new Set<WaitlistStatus>([
  'disqualified',
  'queued',
]);

export type WaitlistTransitionError =
  | 'invalid_transition'
  | 'decision_reason_required';

export interface WaitlistTransitionInput {
  readonly decisionReason?: string | null;
}

export interface WaitlistTransitionResult {
  readonly ok: boolean;
  readonly error?: WaitlistTransitionError;
}

export function isWaitlistPendingStatus(
  status: string | null | undefined
): status is WaitlistStatus {
  return Boolean(
    status && WAITLIST_PENDING_STATUSES.has(status as WaitlistStatus)
  );
}

export function isWaitlistApprovedStatus(
  status: string | null | undefined
): status is WaitlistStatus {
  return Boolean(
    status && WAITLIST_APPROVED_STATUSES.has(status as WaitlistStatus)
  );
}

export function isWaitlistInviteRedeemableStatus(
  status: string | null | undefined
): status is 'invited' | 'approved' {
  return status === 'invited' || status === 'approved';
}

export function isWaitlistSignupEligibleStatus(
  status: string | null | undefined
): status is 'invited' | 'approved' | 'claimed' {
  return Boolean(
    status && WAITLIST_SIGNUP_ELIGIBLE_STATUSES.has(status as WaitlistStatus)
  );
}

export function shouldSendWaitlistConfirmationForStatus(
  status: string | null | undefined
): boolean {
  return status === 'waitlisted';
}

export function shouldSendWaitlistWelcomeForStatus(
  status: string | null | undefined
): boolean {
  return status === 'signed_up' || status === 'claimed';
}

export function canTransitionWaitlistStatus(
  fromStatus: WaitlistStatus,
  toStatus: WaitlistStatus
): boolean {
  if (fromStatus === toStatus) return true;
  return ALLOWED_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

/**
 * Validate a status move against the Mom Test funnel rules. Entering
 * `disqualified` or `queued` requires a decision reason (a short machine
 * code, not free text); `waitlisted` is only reachable from `disqualified`,
 * and that move carries the reason too (needs collected, then waitlisted).
 */
export function transitionWaitlistStatus(
  fromStatus: WaitlistStatus,
  toStatus: WaitlistStatus,
  input: WaitlistTransitionInput = {}
): WaitlistTransitionResult {
  if (!canTransitionWaitlistStatus(fromStatus, toStatus)) {
    return { ok: false, error: 'invalid_transition' };
  }
  const requiresReason =
    REQUIRES_DECISION_REASON.has(toStatus) ||
    (toStatus === 'waitlisted' && fromStatus === 'disqualified');
  if (requiresReason && !(input.decisionReason ?? '').trim()) {
    return { ok: false, error: 'decision_reason_required' };
  }
  return { ok: true };
}

export function toAdminWaitlistLabel(status: string): string {
  switch (status) {
    case 'new':
    case 'chat_started':
    case 'qualified':
      return 'Pending review';
    case 'queued':
      return 'Queued (held)';
    case 'waitlisted':
      return 'Waitlisted';
    case 'disqualified':
      return 'Not a fit';
    case 'invited':
      return 'Invited';
    case 'approved':
    case 'claimed':
      return 'Approved';
    case 'signed_up':
      return 'Signed up';
    case 'rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    case 'blocked':
      return 'Blocked';
    default:
      return status;
  }
}
