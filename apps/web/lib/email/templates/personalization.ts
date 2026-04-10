import { capitalizeFirst, normalizeString } from '@/lib/utils/string-utils';

const NAME_TOKEN_PATTERN = /^[A-Za-z][A-Za-z'-]*$/;
const DISALLOWED_GREETING_TOKENS = new Set([
  'dj',
  'mc',
  'lil',
  'big',
  'young',
  'yung',
  'the',
  'official',
]);

function formatNameToken(token: string): string {
  return token
    .toLowerCase()
    .split(/([-'])/)
    .map(part => (part === '-' || part === "'" ? part : capitalizeFirst(part)))
    .join('');
}

export function resolveSafeFirstName(
  creatorName: string | null | undefined,
  username: string
): string | null {
  const trimmedName = creatorName?.trim() ?? '';
  if (!trimmedName) return null;

  const normalizedName = normalizeString(trimmedName);
  const normalizedUsername = normalizeString(username).replace(/^@/, '');
  if (normalizedName === normalizedUsername) {
    return null;
  }

  const tokens = trimmedName.replace(/\s+/g, ' ').split(' ').filter(Boolean);
  // Stay intentionally conservative: only personalize clear two-word names.
  if (tokens.length !== 2) {
    return null;
  }

  if (!tokens.every(token => NAME_TOKEN_PATTERN.test(token))) {
    return null;
  }

  const [firstToken, lastToken] = tokens;
  const normalizedFirstToken = firstToken.toLowerCase();
  const normalizedLastToken = lastToken.toLowerCase();
  if (
    DISALLOWED_GREETING_TOKENS.has(normalizedFirstToken) ||
    DISALLOWED_GREETING_TOKENS.has(normalizedLastToken)
  ) {
    return null;
  }

  return formatNameToken(firstToken);
}
