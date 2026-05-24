import type { WaitlistEntryRow } from '@/lib/admin/types';

/** Map platform ID to display name */
export const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  twitch: 'Twitch',
  linktree: 'Linktree',
  facebook: 'Facebook',
  threads: 'Threads',
  snapchat: 'Snapchat',
  unknown: 'Unknown',
};

export const PRIMARY_GOAL_LABELS: Record<string, string> = {
  streams: 'Streams',
  merch: 'Merch',
  tickets: 'Tickets',
};

export const STATUS_LABELS: Record<WaitlistEntryRow['status'], string> = {
  new: 'Waitlisted',
  chat_started: 'Chat started',
  qualified: 'Qualified',
  waitlisted: 'Waitlisted',
  invited: 'Invited',
  approved: 'Approved',
  claimed: 'Signed up',
  signed_up: 'Signed up',
  rejected: 'Rejected',
  expired: 'Expired',
  blocked: 'Blocked',
};

/** Map status to badge variant */
export const STATUS_VARIANTS: Record<
  WaitlistEntryRow['status'],
  'primary' | 'secondary' | 'success' | 'error' | 'warning'
> = {
  new: 'secondary',
  chat_started: 'secondary',
  qualified: 'secondary',
  waitlisted: 'secondary',
  invited: 'primary',
  approved: 'primary',
  claimed: 'success',
  signed_up: 'success',
  rejected: 'error',
  expired: 'warning',
  blocked: 'error',
};
