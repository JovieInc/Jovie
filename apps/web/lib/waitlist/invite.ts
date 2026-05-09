import { APP_NAME } from '@/constants/app';
import { getFounderWelcomeEmail } from '@/lib/email/templates/founder-welcome';
import { escapeHtml } from '@/lib/email/utils';
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
  token?: string;
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
  token,
}: BuildWaitlistInviteEmailParams): {
  message: NotificationMessage;
  target: NotificationTarget;
  inviteUrl: string;
} {
  const name = (fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const inviteUrl = new URL('/waitlist/invite', appUrl);
  if (token) inviteUrl.searchParams.set('token', token);
  const subject = "You're off the waitlist!";

  const text = `${greeting}\n\nYou're off the waitlist! Your Jovie profile is ready.\n\nUse this secure link to finish signup:\n${inviteUrl.toString()}\n\nIf you didn't request this, you can ignore this email.`;

  const html = `<p>${escapeHtml(greeting)}</p><p>You're off the waitlist! Your Jovie profile is ready.</p><p><a href="${inviteUrl.toString()}">Finish signup</a></p><p><small>If you didn't request this, you can ignore this email.</small></p>`;

  return {
    inviteUrl: inviteUrl.toString(),
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

export function buildWaitlistConfirmationEmail({
  email,
  fullName,
  appUrl = NOTIFICATIONS_APP_URL,
  dedupKey,
}: Omit<BuildWaitlistInviteEmailParams, 'token'>): {
  message: NotificationMessage;
  target: NotificationTarget;
} {
  const name = (fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const waitlistUrl = new URL('/waitlist', appUrl).toString();

  const text = `${greeting}\n\nYou're on the ${APP_NAME} waitlist. We'll email you when your access is ready.\n\nYou can check your status here:\n${waitlistUrl}\n\nIf you didn't request this, you can ignore this email.`;

  const html = `<p>${escapeHtml(greeting)}</p><p>You're on the ${APP_NAME} waitlist. We'll email you when your access is ready.</p><p><a href="${waitlistUrl}">Check waitlist status</a></p><p><small>If you didn't request this, you can ignore this email.</small></p>`;

  return {
    target: { email },
    message: {
      id: dedupKey ?? `waitlist_confirmation:${email}`,
      dedupKey,
      category: 'transactional',
      subject: `You're on the ${APP_NAME} waitlist`,
      text,
      html,
      respectUserPreferences: false,
      dismissible: false,
    },
  };
}

export function buildWaitlistWelcomeEmail({
  email,
  fullName,
  dedupKey,
}: Pick<BuildWaitlistInviteEmailParams, 'email' | 'fullName' | 'dedupKey'>): {
  message: NotificationMessage;
  target: NotificationTarget;
} {
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;
  const welcome = getFounderWelcomeEmail({ firstName });

  return {
    target: { email },
    message: {
      id: dedupKey ?? `waitlist_welcome:${email}`,
      dedupKey,
      category: 'transactional',
      subject: welcome.subject,
      text: welcome.text,
      html: welcome.html,
      respectUserPreferences: false,
      dismissible: false,
    },
  };
}
