/**
 * Lightweight content filter for usernames and display names.
 *
 * Prevents non-SEO-safe words from appearing in public-facing profile fields.
 * Shared between client and server for consistent validation.
 */

// ============================================================================
// Blocked word list
// ============================================================================

/**
 * Words that are blocked from appearing in usernames or display names.
 * Checked against normalized (lowercased, hyphens/spaces collapsed) input.
 *
 * Categories:
 * - Profanity and vulgar language
 * - Slurs and hate speech
 * - Sexual/explicit terms
 * - Scam/impersonation signals
 */
const BLOCKED_WORDS: readonly string[] = [
  // Profanity
  'fuck',
  'shit',
  'ass',
  'asshole',
  'bitch',
  'bastard',
  'damn',
  'dick',
  'piss',
  'crap',
  'cunt',
  'cock',
  'bollocks',
  'bugger',
  'twat',
  'wanker',
  'prick',
  'douche',
  'douchebag',
  'motherfucker',

  // Slurs and hate speech
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'retarded',
  'tranny',
  'chink',
  'spic',
  'kike',
  'wetback',
  'gook',
  'dyke',
  'coon',
  'beaner',
  'cracker',
  'honky',
  'gringo',
  'raghead',
  'towelhead',
  'zipperhead',
  'jap',
  'paki',

  // Sexual/explicit
  'porn',
  'hentai',
  'xxx',
  'nsfw',
  'milf',
  'dildo',
  'vibrator',
  'orgasm',
  'ejaculate',
  'blowjob',
  'handjob',
  'footjob',
  'gangbang',
  'bukkake',
  'creampie',
  'cumshot',
  'deepthroat',
  'anal',
  'pussy',
  'vagina',
  'penis',
  'titties',
  'boobs',
  'nude',
  'naked',
  'onlyfans',
  'sexting',
  'camgirl',
  'camboy',
  'escort',
  'hooker',
  'whore',
  'slut',
  'hoe',
  'thot',
  'cum',

  // Drugs (non-SEO-safe terms)
  'cocaine',
  'heroin',
  'meth',
  'crackhead',
  'methhead',

  // Violence
  'killall',
  'genocide',
  'terrorist',
  'terrorism',

  // Scam/impersonation
  'officialjovie',
  'joviesupport',
  'jovieadmin',
  'joviestaff',
  'joviemod',
] as const;

// ============================================================================
// Normalization and matching
// ============================================================================

/**
 * Normalize text for comparison by stripping separators and lowercasing.
 * This catches evasion attempts like "f-u-c-k" or "f u c k".
 */
function normalizeForFilter(input: string): string {
  return input
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/[^a-z0-9]/g, '');
}

// Short words (<=3 chars) are only matched exactly to avoid false positives
// (e.g. "ass" should not flag "class" or "assassin")
const SHORT_WORD_THRESHOLD = 3;
const SHORT_BLOCKED = new Set(
  BLOCKED_WORDS.filter(
    w => normalizeForFilter(w).length <= SHORT_WORD_THRESHOLD
  ).map(w => normalizeForFilter(w))
);
const LONG_BLOCKED = BLOCKED_WORDS.filter(
  w => normalizeForFilter(w).length > SHORT_WORD_THRESHOLD
).map(w => normalizeForFilter(w));

// ============================================================================
// Public API
// ============================================================================

export interface ContentFilterResult {
  isClean: boolean;
  error?: string;
}

/**
 * Check if text contains blocked content.
 * Uses a two-tier approach:
 *  - Short blocked words (<=3 chars): exact match only against whole
 *    segments split on word boundaries to reduce false positives.
 *  - Longer blocked words (>3 chars): substring match against the
 *    fully-collapsed string to catch evasion via separators.
 *
 * @param input - The username or display name to check
 * @returns Result indicating whether the input is clean
 */
export function checkContent(input: string): ContentFilterResult {
  if (!input) return { isClean: true };

  const normalized = normalizeForFilter(input);

  // 1) Check short words: split original input on non-alphanumeric chars
  //    and check each segment as an exact match
  const segments = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const segment of segments) {
    if (SHORT_BLOCKED.has(segment)) {
      return {
        isClean: false,
        error: 'This name contains language that is not allowed',
      };
    }
  }

  // 1b) Also check the fully-normalized string against short words
  //     (catches obfuscated short words like "a-s-s" -> "ass")
  if (SHORT_BLOCKED.has(normalized)) {
    return {
      isClean: false,
      error: 'This name contains language that is not allowed',
    };
  }

  // 2) Check longer words via substring match on normalized (collapsed) input
  for (const word of LONG_BLOCKED) {
    if (normalized.includes(word)) {
      return {
        isClean: false,
        error: 'This name contains language that is not allowed',
      };
    }
  }

  return { isClean: true };
}

/**
 * Quick boolean check. Convenience wrapper around checkContent.
 *
 * @param input - The username or display name to check
 * @returns True if the input passes the content filter
 */
export function isContentClean(input: string): boolean {
  return checkContent(input).isClean;
}
