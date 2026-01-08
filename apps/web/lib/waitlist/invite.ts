import { NOTIFICATIONS_APP_URL } from '@/lib/notifications/config';
import type {
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

interface BuildWaitlistInviteEmailParams {
  email: string;
  fullName?: string | null;
  appUrl?: string;
  dedupKey?: string;
}

/**
 * Build waitlist approval email for simplified signup flow.
 * Profile is already created and linked on approval - user just needs to sign in.
 */
export function buildWaitlistInviteEmail({
  email,
  fullName,
  appUrl = NOTIFICATIONS_APP_URL,
  dedupKey,
}: BuildWaitlistInviteEmailParams): {
  message: NotificationMessage;
  target: NotificationTarget;
  inviteUrl: string;
} {
  const name = (fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const inviteUrl = new URL('/signin', appUrl).toString();
  const subject = "You're off the waitlist!";

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
