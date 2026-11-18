import type { OutboundRow } from '@/lib/outbound/types';

/** The reason a hidden draft cannot be edited or approved. */
export function outboundMessageEmptyReason(row: OutboundRow): string {
  if (row.relationshipHold != null) return row.relationshipHold;
  if (row.view === 'needs_judge')
    return 'Draft hidden until the page and onboarding pass the dogfood judge.';
  if (row.flags.includes('cold_draft_unavailable'))
    return 'Draft hidden until certified page facts and email compliance checks are available.';
  if (row.channel && row.profilePath)
    return 'No draft is available for this profile yet.';
  return row.channel
    ? 'No claim link yet. Build the profile to draft a message.'
    : 'No reachable channel: no email address or Instagram handle on file.';
}
