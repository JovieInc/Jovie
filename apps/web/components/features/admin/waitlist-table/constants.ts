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

/** Map status to badge variant */
export const STATUS_VARIANTS: Record<
  string,
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
