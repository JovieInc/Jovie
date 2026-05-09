import type { waitlistStatusEnum } from '@/lib/db/schema/enums';

export type WaitlistStatus = (typeof waitlistStatusEnum.enumValues)[number];

export const WAITLIST_PENDING_STATUSES = new Set<WaitlistStatus>([
  'new',
  'chat_started',
  'qualified',
  'waitlisted',
]);

export const WAITLIST_APPROVED_STATUSES = new Set<WaitlistStatus>([
  'invited',
  'approved',
  'claimed',
  'signed_up',
]);

export const WAITLIST_TERMINAL_STATUSES = new Set<WaitlistStatus>([
  'signed_up',
  'rejected',
  'expired',
  'blocked',
]);

const ALLOWED_TRANSITIONS: Record<WaitlistStatus, readonly WaitlistStatus[]> = {
  new: [
    'qualified',
    'waitlisted',
    'invited',
    'approved',
    'rejected',
    'blocked',
  ],
  chat_started: ['qualified', 'waitlisted', 'blocked'],
  qualified: ['approved', 'waitlisted', 'rejected', 'blocked'],
  waitlisted: ['invited', 'approved', 'rejected', 'blocked'],
  invited: ['approved', 'signed_up', 'expired', 'blocked'],
  approved: ['signed_up', 'expired', 'blocked'],
  claimed: ['signed_up', 'blocked'],
  signed_up: [],
  rejected: [],
  expired: ['waitlisted', 'invited'],
  blocked: [],
};

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

export function toAdminWaitlistLabel(status: string): string {
  switch (status) {
    case 'new':
    case 'chat_started':
    case 'qualified':
    case 'waitlisted':
      return 'Waitlisted';
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
