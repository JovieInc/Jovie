/**
 * Username validation and reserved words checking
 */

// Reserved words that cannot be used as usernames
const RESERVED_USERNAMES = [
  // System routes
  'api',
  'admin',
  'dashboard',
  'onboarding',
  'settings',
  'profile',
  'login',
  'signin',
  'signup',
  'signout',
  'logout',
  'register',
  'auth',
  'oauth',
  'callback',
  'verify',
  'reset',
  'forgot',

  // Legal/company pages
  'about',
  'contact',
  'privacy',
  'terms',
  'legal',
  'help',
  'support',
  'blog',
  'news',
  'press',
  'careers',
  'jobs',
  'team',
  'company',

  // Features
  'pricing',
  'features',
  'demo',
  'sandbox',
  'test',
  'staging',
  'production',
  'dev',
  'development',
  'preview',
  'beta',
  'alpha',

  // Common reserved
  'www',
  'mail',
  'ftp',
  'email',
  'smtp',
  'pop',
  'imap',
  'http',
  'https',
  'app',
  'mobile',
  'desktop',
  'download',
  'downloads',
  'assets',
  'static',
  'public',
  'private',
  'secure',
  'cdn',
  'media',
  'images',

  // Social/community
  'feed',
  'explore',
  'discover',
  'trending',
  'popular',
  'featured',
  'search',
  'find',
  'browse',
  'categories',
  'tags',
  'topics',

  // Account related
  'account',
  'accounts',
  'user',
  'users',
  'member',
  'members',
  'subscriber',
  'subscribers',
  'customer',
  'customers',
  'client',

  // Music specific
  'artist',
  'artists',
  'album',
  'albums',
  'track',
  'tracks',
  'playlist',
  'playlists',
  'genre',
  'genres',
  'charts',
  'top',

  // Jovie specific
  'jovie',
  'tip',
  'tips',
  'listen',
  'share',
  'link',
  'links',
  'bio',
  'waitlist',
  'invite',
  'invites',
  'referral',
  'refer',
];

// Username validation rules
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-zA-Z0-9-]+$/;

export interface UsernameValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate a username against all rules
 *
 * @param username - The username to validate
 * @returns Validation result with error message if invalid
 */
export function validateUsername(username: string): UsernameValidationResult {
  // Check if empty
  if (!username || username.trim() === '') {
    return { isValid: false, error: 'Username is required' };
  }

  // Normalize username
  const normalized = username.toLowerCase().trim();

  // Check length
  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    };
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Username must be no more than ${USERNAME_MAX_LENGTH} characters`,
    };
  }

  // Check pattern (alphanumeric and hyphen only)
  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      isValid: false,
      error: 'Username can only contain letters, numbers, and hyphens',
    };
  }

  // Check if starts with number or hyphen
  if (/^[0-9-]/.test(normalized)) {
    return {
      isValid: false,
      error: 'Username must start with a letter',
    };
  }

  // Check if ends with hyphen
  if (/-$/.test(normalized)) {
    return {
      isValid: false,
      error: 'Username cannot end with a hyphen',
    };
  }

  // Check for consecutive hyphens
  if (/--/.test(normalized)) {
    return {
      isValid: false,
      error: 'Username cannot contain consecutive hyphens',
    };
  }

  // Check reserved words
  if (RESERVED_USERNAMES.includes(normalized)) {
    return {
      isValid: false,
      error: 'This username is reserved and cannot be used',
    };
  }

  // Check if it's a reserved pattern (e.g., starts with reserved word)
  const startsWithReserved = RESERVED_USERNAMES.some(
    reserved =>
      normalized.startsWith(reserved + '_') ||
      normalized.startsWith(reserved + '-')
  );

  if (startsWithReserved) {
    return {
      isValid: false,
      error: 'This username pattern is reserved',
    };
  }

  return { isValid: true };
}

/**
 * Normalize a username for storage
 *
 * @param username - The username to normalize
 * @returns Normalized username
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim();
}

/**
 * Check if a username is available (client-side pre-check)
 * This doesn't check the database, just validates format and reserved words
 *
 * @param username - The username to check
 * @returns True if username passes all validation rules
 */
export function isUsernameAvailable(username: string): boolean {
  const validation = validateUsername(username);
  return validation.isValid;
}
