import { Debouncer } from '@tanstack/react-pacer';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Creates a debounced function using TanStack Pacer.
 *
 * @deprecated Prefer using TanStack Pacer hooks directly in React components:
 * - `useAsyncDebouncer` for async operations (API calls)
 * - `useDebouncer` for synchronous operations
 * - `useAutoSave` for debounced save patterns
 * All available from `@/lib/pacer`.
 *
 * This utility is kept for non-React contexts and tests only.
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns A debounced function with cancel and flush methods
 *
 * @example
 * ```ts
 * const debouncedSave = debounce(saveData, 500);
 * debouncedSave(data); // Will execute after 500ms of no calls
 * debouncedSave.cancel(); // Cancel pending execution
 * debouncedSave.flush(); // Execute immediately if pending
 * ```
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & {
  cancel: () => void;
  flush: () => void;
} {
  const debouncer = new Debouncer(func, { wait });

  const debounced = (...args: Parameters<T>) => {
    debouncer.maybeExecute(...args);
  };

  debounced.cancel = () => {
    debouncer.cancel();
  };

  debounced.flush = () => {
    // Get the last args that were passed and execute immediately if pending
    const state = debouncer.store.state;
    if (state.isPending && state.lastArgs) {
      debouncer.cancel();
      func(...(state.lastArgs as Parameters<T>));
    }
  };

  return debounced as ((...args: Parameters<T>) => void) & {
    cancel: () => void;
    flush: () => void;
  };
}

export function slugify(text: string): string {
  const safeText = text.slice(0, 200);
  return safeText
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/[\s_-]+/g, '-')
    .replaceAll(/(^-+)|(-+$)/g, '');
}

export function generateHandle(name: string): string {
  const baseHandle = slugify(name);
  return baseHandle || 'artist';
}

export function extractSpotifyId(url: string): string | null {
  const patterns = [
    /^https?:\/\/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/,
    /^spotify:artist:([a-zA-Z0-9]+)$/,
    /^([a-zA-Z0-9]+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export function detectPlatformFromUA(userAgent?: string): string | null {
  if (!userAgent) {
    return null;
  }

  const ua = userAgent.toLowerCase();
  const platformMatchers = [
    { tokens: ['iphone', 'ipad'], platform: 'ios' },
    { tokens: ['android'], platform: 'android' },
    { tokens: ['macintosh'], platform: 'macos' },
    { tokens: ['windows'], platform: 'windows' },
    { tokens: ['linux'], platform: 'linux' },
  ];

  const matched = platformMatchers.find(({ tokens }) =>
    tokens.some(token => ua.includes(token))
  );

  return matched?.platform ?? 'web';
}

const EXTERNAL_URL_PATTERN = /^https?:\/\//;

export function isExternalUrl(href: string): boolean {
  return EXTERNAL_URL_PATTERN.test(href);
}

export function getExternalLinkProps(isExternal: boolean) {
  return isExternal
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {};
}
