import { pgEnum } from 'drizzle-orm/pg-core';

// Waitlist Enums
export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'new',
  'invited',
  'claimed',
  'chat_started',
  'qualified',
  'waitlisted',
  'disqualified',
  'queued',
  'approved',
  'signed_up',
  'rejected',
  'expired',
  'blocked',
]);

export const waitlistInviteStatusEnum = pgEnum('waitlist_invite_status', [
  'pending',
  'sending',
  'sent',
  'failed',
]);
