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
  const inviteUrl = (() => {
    if (claimToken) {
      const url = new URL(`/claim/${claimToken}`, appUrl);
      return url.toString();
    }

    const url = new URL('/signup', appUrl);
    url.searchParams.set('redirect_url', redirectUrl);
    return url.toString();
  })();

  const name = (fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const subject = "You're off the waitlist";

  const text = `${greeting}\n\nYou're off the waitlist. Claim your Jovie profile here:\n${inviteUrl}\n\nIf you didn’t request this, you can ignore this email.`;

  const html = `<p>${greeting}</p><p>You're off the waitlist. Claim your Jovie profile here:</p><p><a href="${inviteUrl}">Claim your profile</a></p><p>If you didn't request this, you can ignore this email.</p>`;

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
