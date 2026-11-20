import { normalizeString } from '@/lib/utils/string-utils';

const NAME_TOKEN_PATTERN = /^\p{L}[\p{L}'’-]*$/u;
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

// Ordinary words that lead band names ("Good Dropouts", "Black Keys") far more
// often than they are given names. Checked on the first token only, because
// the same words are common surnames ("Tim White", "Ana Green").
const NON_NAME_LEADING_TOKENS = new Set([
  'good',
  'bad',
  'great',
  'happy',
  'sad',
  'wild',
  'dead',
  'lost',
  'new',
  'old',
  'our',
  'my',
  'black',
  'white',
  'red',
  'blue',
  'green',
  'golden',
  'silver',
  'sweet',
  'free',
  'saint',
]);

function capitalizeNamePart(part: string): string {
  const [firstCharacter = '', ...remainingCharacters] = Array.from(part);
  return `${firstCharacter.toLocaleUpperCase()}${remainingCharacters.join('')}`;
}

function formatNameToken(token: string): string {
  return token
    .toLocaleLowerCase()
    .split(/([-'’])/u)
    .map(part =>
      part === '-' || part === "'" || part === '’'
        ? part
        : capitalizeNamePart(part)
    )
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

  const tokens = trimmedName.replaceAll(/\s+/g, ' ').split(' ').filter(Boolean);
  // Stay intentionally conservative: only personalize clear two-word names.
  if (tokens.length !== 2) {
    return null;
  }

  if (!tokens.every(token => NAME_TOKEN_PATTERN.test(token))) {
    return null;
  }

  const [firstToken, lastToken] = tokens;
  const normalizedFirstToken = firstToken.toLocaleLowerCase();
  const normalizedLastToken = lastToken.toLocaleLowerCase();
  if (
    NON_NAME_LEADING_TOKENS.has(normalizedFirstToken) ||
    DISALLOWED_GREETING_TOKENS.has(normalizedFirstToken) ||
    DISALLOWED_GREETING_TOKENS.has(normalizedLastToken)
  ) {
    return null;
  }

  return formatNameToken(firstToken);
}
