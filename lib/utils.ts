import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & {
  cancel: () => void;
  flush: () => void;
} {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      lastArgs = null;
      func(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      lastArgs = null;
    }
  };
  debounced.flush = () => {
    if (timeout && lastArgs) {
      clearTimeout(timeout);
      timeout = null;
      const args = lastArgs;
      lastArgs = null;
      func(...args);
    }
  };
  return debounced as ((...args: Parameters<T>) => void) & {
    cancel: () => void;
    flush: () => void;
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  if (!userAgent) return null;

  const ua = userAgent.toLowerCase();

  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('macintosh')) return 'macos';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('linux')) return 'linux';

  return 'web';
}
