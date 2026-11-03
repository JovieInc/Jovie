import { APP_NAME } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
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
  dedupKey: string;
  token?: string;
  /** Whether a creator profile already exists for this person. */
  hasProfile?: boolean;
}

/**
 * Invite copy is founder-approved. Tim approved "You're off the waitlist!" /
 * "Your Jovie profile is ready." on 2026-10-29; any change needs his OK
 * again. A person with no profile yet is told it is ready, which is not true,
 * so a variant is proposed for that state and sent to Tim as a decision
 * card. Until he approves it, every invite keeps the approved copy.
 * EVENT: Tim approves the no-profile variant -> set this to true.
 */
export const NO_PROFILE_INVITE_COPY_APPROVED = false;

export type WaitlistInviteCopyVariant = 'profile_ready' | 'finish_setup';

export const WAITLIST_INVITE_COPY = {
  profile_ready: {
    subject: "You're off the waitlist!",
    lead: "You're off the waitlist! Your Jovie profile is ready.",
    action: 'Finish signup',
  },
  finish_setup: {
    subject: "You're in. Finish setting up your Jovie profile.",
    lead: "You're in. Finish setting up your Jovie profile.",
    action: 'Set up your profile',
  },
} as const satisfies Record<
  WaitlistInviteCopyVariant,
  { subject: string; lead: string; action: string }
>;

/** Copy follows profile state, gated on the founder approving the variant. */
export function selectWaitlistInviteCopyVariant(
  hasProfile: boolean | undefined,
  noProfileVariantApproved = NO_PROFILE_INVITE_COPY_APPROVED
): WaitlistInviteCopyVariant {
  return hasProfile === false && noProfileVariantApproved
    ? 'finish_setup'
    : 'profile_ready';
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
  hasProfile,
}: BuildWaitlistInviteEmailParams): {
  message: NotificationMessage;
  target: NotificationTarget;
  inviteUrl: string;
} {
  const name = (fullName ?? '').trim();
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const inviteUrl = new URL(APP_ROUTES.WAITLIST_INVITE, appUrl);
  if (token) inviteUrl.searchParams.set('token', token);
  const copy =
    WAITLIST_INVITE_COPY[selectWaitlistInviteCopyVariant(hasProfile)];
  const subject = copy.subject;

  const text = `${greeting}\n\n${copy.lead}\n\nUse this secure link to finish signup:\n${inviteUrl.toString()}\n\nIf you didn't request this, you can ignore this email.`;

  const html = `<p>${escapeHtml(greeting)}</p><p>${copy.lead}</p><p><a href="${inviteUrl.toString()}">${copy.action}</a></p><p><small>If you didn't request this, you can ignore this email.</small></p>`;

  return {
    inviteUrl: inviteUrl.toString(),
    target: {
      email,
    },
    message: {
      id: dedupKey,
      dedupKey,
      idempotencyKey: dedupKey,
      category: 'transactional',
      emailRoute: {
        stream: 'transactional',
        purpose: 'waitlist-invite',
        consent: 'account-transaction',
      },
      subject,
      text,
      html,
      pushTitle: subject,
      pushBody: 'Your Jovie access is ready. Open the app to get started.',
      channels: ['email', 'push'],
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
  const waitlistUrl = new URL(APP_ROUTES.WAITLIST, appUrl).toString();

  const text = `${greeting}\n\nYou're on the ${APP_NAME} waitlist. We'll email you when your access is ready.\n\nYou can check your status here:\n${waitlistUrl}\n\nIf you didn't request this, you can ignore this email.`;

  const html = `<p>${escapeHtml(greeting)}</p><p>You're on the ${APP_NAME} waitlist. We'll email you when your access is ready.</p><p><a href="${waitlistUrl}">Check waitlist status</a></p><p><small>If you didn't request this, you can ignore this email.</small></p>`;

  return {
    target: { email },
    message: {
      id: dedupKey,
      dedupKey,
      idempotencyKey: dedupKey,
      category: 'transactional',
      emailRoute: {
        stream: 'transactional',
        purpose: 'waitlist-joined',
        consent: 'account-transaction',
      },
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
      id: dedupKey,
      dedupKey,
      idempotencyKey: dedupKey,
      category: 'transactional',
      emailRoute: {
        stream: 'transactional',
        purpose: 'waitlist-welcome',
        consent: 'account-transaction',
      },
      subject: welcome.subject,
      text: welcome.text,
      html: welcome.html,
      respectUserPreferences: false,
      dismissible: false,
    },
  };
}
