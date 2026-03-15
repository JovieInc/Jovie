import 'server-only';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'sharklasers.com',
  'trashmail.com',
  'fakeinbox.com',
  'maildrop.cc',
  'dispostable.com',
  'getnada.com',
  'tempr.email',
  'mailnesia.com',
  'mytemp.email',
  'mohmal.com',
  'temp-mail.org',
  'emailondeck.com',
  '33mail.com',
  'guerrillamailblock.com',
  'grr.la',
  'guerrillamail.info',
  'tmail.com',
  'tmpmail.net',
  'bupmail.com',
  'mailcatch.com',
  'tempail.com',
  'discard.email',
  'harakirimail.com',
  'mailexpire.com',
  'throwam.com',
  'mailnull.com',
  'jetable.org',
  'trashymail.com',
  'mailforspam.com',
  'spamgourmet.com',
  'tempinbox.com',
  'filzmail.com',
  'mailmoat.com',
  'spamfree24.org',
  'mytrashmail.com',
  'mailzilla.com',
  'incognitomail.com',
  'mailblocks.com',
  'mintemail.com',
  'tempomail.fr',
  'mail-temporaire.fr',
  'courrieltemporaire.com',
  'trash-mail.com',
  'guerrillamail.de',
  'guerrillamail.net',
]);

const ROLE_PREFIXES = [
  'noreply',
  'donotreply',
  'admin',
  'webmaster',
  'postmaster',
  'info',
  'no-reply',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // NOSONAR (S5852) - ReDoS bounded by email.length > 254 check applied before this regex

const CONSONANTS_AND_DIGITS = /[^aeiou\s@.]/gi;

export interface EmailFilterResult {
  invalid: boolean;
  suspicious: boolean;
  reason: string | null;
}

function isRandomLocalPart(local: string): boolean {
  if (local.length < 30) return false;
  const matches = local.match(CONSONANTS_AND_DIGITS);
  const ratio = (matches?.length ?? 0) / local.length;
  return ratio > 0.7;
}

export function filterEmail(email: string): EmailFilterResult {
  if (!email || !EMAIL_REGEX.test(email)) {
    return { invalid: true, suspicious: false, reason: 'Invalid email format' };
  }

  const lower = email.toLowerCase();
  const [local, domain] = lower.split('@');

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      invalid: true,
      suspicious: false,
      reason: 'Disposable email domain',
    };
  }

  for (const prefix of ROLE_PREFIXES) {
    if (local === prefix || local.startsWith(`${prefix}+`)) {
      return {
        invalid: false,
        suspicious: true,
        reason: `Role-based address: ${prefix}`,
      };
    }
  }

  if (isRandomLocalPart(local)) {
    return {
      invalid: true,
      suspicious: false,
      reason: 'Spam trap pattern: random local part',
    };
  }

  return { invalid: false, suspicious: false, reason: null };
}
