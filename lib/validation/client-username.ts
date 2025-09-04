/**
 * Client-side username validation for instant feedback
 * Reduces validation response time from 500ms+ to <50ms
 */

export interface ClientValidationResult {
  valid: boolean;
  error: string | null;
  suggestion?: string;
}

// Username validation rules (must match server-side validation)
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-zA-Z0-9-]+$/;

/**
 * Instant client-side username validation
 * Provides immediate feedback without API calls
 */
export function validateUsernameFormat(
  username: string
): ClientValidationResult {
  if (!username) {
    return { valid: false, error: null };
  }

  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      valid: false,
      error: `Handle must be at least ${USERNAME_MIN_LENGTH} characters`,
    };
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Handle must be less than ${USERNAME_MAX_LENGTH} characters`,
    };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      valid: false,
      error: 'Handle can only contain letters, numbers, and hyphens',
    };
  }

  // Additional validation rules
  if (username.startsWith('-') || username.endsWith('-')) {
    return {
      valid: false,
      error: 'Handle cannot start or end with a hyphen',
    };
  }

  if (username.includes('--')) {
    return {
      valid: false,
      error: 'Handle cannot contain consecutive hyphens',
    };
  }

  // Reserved usernames
  const reservedUsernames = [
    'admin',
    'api',
    'app',
    'auth',
    'blog',
    'dashboard',
    'help',
    'mail',
    'root',
    'support',
    'www',
    'ftp',
    'email',
    'test',
    'demo',
    'stage',
    'staging',
    'dev',
    'development',
    'prod',
    'production',
    'beta',
    'alpha',
    'preview',
    'cdn',
    'assets',
  ];

  if (reservedUsernames.includes(username.toLowerCase())) {
    return {
      valid: false,
      error: 'This handle is reserved and cannot be used',
      suggestion: `${username}-artist`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Generate username suggestions based on input
 */
export function generateUsernameSuggestions(
  baseUsername: string,
  artistName?: string
): string[] {
  const suggestions: string[] = [];
  const base = baseUsername.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (artistName) {
    const artistSlug = artistName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');
    suggestions.push(artistSlug);
    suggestions.push(`${artistSlug}-music`);
    suggestions.push(`${artistSlug}-official`);
  }

  if (base) {
    suggestions.push(`${base}-music`);
    suggestions.push(`${base}-official`);
    suggestions.push(`${base}-artist`);

    // Add numbered variations
    for (let i = 1; i <= 3; i++) {
      suggestions.push(`${base}${i}`);
    }
  }

  // Remove duplicates and filter out invalid suggestions
  return [...new Set(suggestions)]
    .filter(suggestion => validateUsernameFormat(suggestion).valid)
    .slice(0, 5); // Limit to 5 suggestions
}

/**
 * Debounce utility for API calls
 */
export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}
