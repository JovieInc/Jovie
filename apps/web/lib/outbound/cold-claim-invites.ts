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
