import {
  EXISTING_RELATIONSHIP_LABEL,
  existingRelationshipHold,
} from '@/lib/leads/existing-relationships';

/**
 * Cold claim invites (admin creator-invite → Resend, plus their follow-up
 * campaign) are closed. Tim approves every outbound target and every copy
 * revision (2026-10-04), and these invites mint a fresh claim link per send,
 * so no revision can be approved before it goes out. Re-open only by routing
 * the rendered invite through the Ovie Outbound approval guard (JOV-7858).
 */
export function isColdClaimInviteSendOpen(): boolean {
  return false;
}

export const COLD_CLAIM_INVITE_CLOSED_MESSAGE =
  'Cold claim invites are closed. Approve each person and message in Ovie Outbound.';

/**
 * Hard gate, independent of the open/closed switch above: an artist Tim
 * already works with never gets a cold claim invite or follow-up. Returns
 * the reason to show, or null when the profile may be invited.
 */
export function coldClaimInviteRelationshipHold(profile: {
  readonly username: string | null;
  readonly displayName: string | null;
  readonly email?: string | null;
  readonly bio?: string | null;
}): string | null {
  return existingRelationshipHold({
    handle: profile.username,
    displayName: profile.displayName,
    contactEmail: profile.email ?? null,
    bio: profile.bio ?? null,
  })
    ? EXISTING_RELATIONSHIP_LABEL
    : null;
}
