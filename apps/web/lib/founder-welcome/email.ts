import { lintCopy } from '@jovie/copy';
import { LEGAL_ENTITY_NAME } from '@/constants/app';

/**
 * Founder welcome: a short personal note from Tim to a /start visitor the
 * golden path admitted. Plain text. The body here is exactly what Tim sees on
 * the approval card and exactly what is sent above the compliance footer.
 */

export const FOUNDER_WELCOME_SUBJECT = 'Welcome to Jovie';

interface FounderWelcomeEmail {
  readonly subject: string;
  readonly text: string;
  readonly headers: Record<string, string>;
}

export class FounderWelcomeBlocked extends Error {}

/** First name only when it reads as a plain name; otherwise no greeting name. */
export function greetingName(firstName: string | null): string | null {
  const name = firstName?.trim().split(/\s+/u)[0] ?? '';
  return /^[\p{L}][\p{L}'.-]{0,29}$/u.test(name) ? name : null;
}

/** One line, no control characters, bounded; null when nothing is left. */
export function cleanArtistName(value: string | null): string | null {
  const name = (value ?? '')
    .replaceAll(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return name.length > 0 ? name : null;
}

export function buildFounderWelcomeBody(input: {
  readonly firstName: string | null;
  readonly artistName: string;
  readonly link: string;
}): string {
  const name = greetingName(input.firstName);
  return [
    name ? `Hi ${name},` : 'Hi there,',
    '',
    `Welcome to Jovie. I'm Tim, I built it, and I'm glad ${input.artistName} is here.`,
    '',
    `Your page is ready whenever you are: ${input.link}`,
    '',
    'If anything feels off, reply here and it comes straight to me.',
    '',
    'Tim',
  ].join('\n');
}

/** Throws FounderWelcomeBlocked when the email cannot go out compliantly. */
export function buildFounderWelcomeEmail(input: {
  readonly body: string;
  readonly mailingAddress: string | null;
  readonly unsubscribeUrl: string | null;
}): FounderWelcomeEmail {
  const address = input.mailingAddress?.trim();
  if (!address) throw new FounderWelcomeBlocked('mailing_address_missing');
  if (!input.unsubscribeUrl) {
    throw new FounderWelcomeBlocked('unsubscribe_unavailable');
  }
  if (!lintCopy(input.body, { register: 'founder-tim' }).ok) {
    throw new FounderWelcomeBlocked('copy_lint_blocked');
  }
  return {
    subject: FOUNDER_WELCOME_SUBJECT,
    text: `${input.body}\n\n--\n${LEGAL_ENTITY_NAME}, ${address}\nNot useful? Unsubscribe: ${input.unsubscribeUrl}`,
    headers: {
      'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
