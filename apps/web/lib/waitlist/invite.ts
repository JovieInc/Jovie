import { NOTIFICATIONS_APP_URL } from '@/lib/notifications/config';
import type {
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

interface BuildWaitlistInviteEmailParams {
  email: string;
  fullName?: string | null;
  appUrl?: string;
  claimToken?: string;
  redirectUrl?: string;
  dedupKey?: string;
}

export function buildWaitlistInviteEmail({
  email,
  fullName,
  appUrl = NOTIFICATIONS_APP_URL,
  claimToken,
  redirectUrl = '/app/dashboard',
  dedupKey,
}: BuildWaitlistInviteEmailParams): {
  message: NotificationMessage;
  target: NotificationTarget;
  inviteUrl: string;
} {
  const name = (fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';

  // Dual-flow support: claim tokens for legacy/admin-ingested profiles, signin for simplified signup
  const inviteUrl = (() => {
    if (claimToken) {
      // LEGACY FLOW: Admin-ingested creators or pre-PR#1736 waitlist entries
      const url = new URL(`/claim/${claimToken}`, appUrl);
      return url.toString();
    }

    // SIMPLIFIED FLOW: Post-PR#1736 public signups (profile already created & linked)
    const url = new URL('/signin', appUrl);
    return url.toString();
  })();

  const subject = "You're off the waitlist!";

  // Dual-flow messaging
  if (claimToken) {
    // LEGACY FLOW: User needs to claim profile
    const text = `${greeting}\n\nYou're off the waitlist! Claim your Jovie profile here:\n${inviteUrl}\n\nIf you didn't request this, you can ignore this email.`;

    const html = `<p>${greeting}</p><p>You're off the waitlist! Claim your Jovie profile here:</p><p><a href="${inviteUrl}">Claim your profile</a></p><p><small>If you didn't request this, you can ignore this email.</small></p>`;

    return {
      inviteUrl,
      target: {
        email,
      },
      message: {
        id: dedupKey ?? `waitlist_invite:${email}`,
        dedupKey,
        category: 'transactional',
        subject,
        text,
        html,
        respectUserPreferences: false,
        dismissible: false,
      },
    };
  }

  // SIMPLIFIED FLOW: User just needs to sign in
  const text = `${greeting}\n\nYou're off the waitlist! Your Jovie profile is ready.\n\nSign in here to get started:\n${inviteUrl}\n\nIf you didn't request this, you can ignore this email.`;

  const html = `<p>${greeting}</p><p>You're off the waitlist! Your Jovie profile is ready.</p><p><a href="${inviteUrl}">Sign in to get started</a></p><p><small>If you didn't request this, you can ignore this email.</small></p>`;

  return {
    inviteUrl,
    target: {
      email,
    },
    message: {
      id: dedupKey ?? `waitlist_invite:${email}`,
      dedupKey,
      category: 'transactional',
      subject,
      text,
      html,
      respectUserPreferences: false,
      dismissible: false,
    },
  };
}
