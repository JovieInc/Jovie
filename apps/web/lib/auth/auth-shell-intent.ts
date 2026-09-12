import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';

export type AuthShellMode = 'sign-in' | 'sign-up';
export type AuthShellIntent = 'sign-in' | 'continue' | 'claim';

export const AUTH_SHELL_HEADINGS = {
  'sign-in': 'Log in to Jovie',
  continue: 'Continue to Jovie',
} as const;

export const AUTH_EMAIL_EMPTY_ERROR = 'Enter your email address.';
export const AUTH_EMAIL_INVALID_ERROR =
  'That email address doesn’t look right. Check it and try again.';
export const AUTH_EMAIL_SEND_LABEL = 'Send sign-in code';
export const AUTH_EMAIL_SENDING_LABEL = 'Sending code…';
export const AUTH_EMAIL_CHANGE_LABEL = 'Change email';
export const AUTH_TROUBLE_SIGNING_IN_LABEL = 'Trouble signing in?';

export type AuthShellBackLink = {
  readonly href: string;
  readonly label: string;
};

export function getAuthShellClaimHeading(handle: string): string {
  return `Claim @${handle}`;
}

export function getAuthShellHeading(
  intent: AuthShellIntent,
  handle?: string
): string {
  if (intent === 'claim' && handle) {
    return getAuthShellClaimHeading(handle);
  }
  if (intent === 'sign-in') return AUTH_SHELL_HEADINGS['sign-in'];
  return AUTH_SHELL_HEADINGS.continue;
}

export function normalizeAuthClaimHandle(
  value: string | null | undefined
): string | undefined {
  const handle = value?.trim().replace(/^@/, '').toLowerCase() ?? '';
  if (
    handle.length < USERNAME_MIN_LENGTH ||
    handle.length > USERNAME_MAX_LENGTH
  ) {
    return undefined;
  }
  return USERNAME_PATTERN.test(handle) ? handle : undefined;
}

export function resolveAuthShellIntent(args: {
  readonly mode: AuthShellMode;
  readonly claimHandle?: string;
}): AuthShellIntent {
  if (args.mode === 'sign-in') return 'sign-in';
  if (args.claimHandle) return 'claim';
  return 'continue';
}

export function resolveAuthShellBackLink(
  params: Pick<URLSearchParams, 'get'>
): AuthShellBackLink | null {
  const handle = normalizeAuthClaimHandle(params.get('handle'));
  if (handle) {
    return {
      href: `/${handle}?claim=1`,
      label: `Back to @${handle}`,
    };
  }

  const redirect = sanitizeRedirectUrl(params.get('redirect_url'));
  if (!redirect) return null;

  if (redirect === '/start' || redirect.startsWith('/start?')) {
    return { href: redirect, label: 'Back to chat' };
  }
  if (redirect === '/onboarding' || redirect.startsWith('/onboarding/')) {
    return { href: redirect, label: 'Back to chat' };
  }

  return null;
}

/** Auth-entry mailbox check. Does not apply scraper host denylists. */
export function isAuthEmailAddress(value: string): boolean {
  const email = value.trim();
  if (email.length === 0 || email.length > 254) return false;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length > 64 || domain.length < 3) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) {
    return false;
  }

  for (const char of email) {
    if (char <= ' ') return false;
  }

  for (const char of domain) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      (char >= '0' && char <= '9');
    if (!(isAlphaNumeric || char === '.' || char === '-')) {
      return false;
    }
  }

  return true;
}
