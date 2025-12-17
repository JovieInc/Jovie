import { NOTIFICATIONS_APP_URL } from '@/lib/notifications/config';
import type {
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

interface BuildWaitlistInviteEmailParams {
  email: string;
  fullName?: string | null;
  appUrl?: string;
  redirectUrl?: string;
  dedupKey?: string;
}

export function buildWaitlistInviteEmail({
  email,
  fullName,
  appUrl = NOTIFICATIONS_APP_URL,
  redirectUrl = '/app/dashboard',
  dedupKey,
}: BuildWaitlistInviteEmailParams): {
  message: NotificationMessage;
  target: NotificationTarget;
  signupUrl: string;
} {
  const signupUrl = (() => {
    const url = new URL('/signup', appUrl);
    url.searchParams.set('redirect_url', redirectUrl);
    return url.toString();
  })();

  const name = (fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const subject = "You're off the waitlist";

  const text = `${greeting}\n\nYou're off the waitlist. Create your Jovie account here:\n${signupUrl}\n\nIf you didn’t request this, you can ignore this email.`;

  const html = `<p>${greeting}</p><p>You're off the waitlist. Create your Jovie account here:</p><p><a href="${signupUrl}">Create your account</a></p><p>If you didn't request this, you can ignore this email.</p>`;

  return {
    signupUrl,
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
