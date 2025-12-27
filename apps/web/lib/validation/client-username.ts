/**
 * Client-side Username Validation
 *
 * @deprecated Import from '@/lib/validation/schemas' instead.
 * This file re-exports from the unified validation schema for backwards compatibility.
 */

export {
  validateUsernameFormat,
  generateUsernameSuggestions,
  type ClientValidationResult,
} from './schemas/username';

/**
 * Debounce utility for API calls.
 *
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
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
