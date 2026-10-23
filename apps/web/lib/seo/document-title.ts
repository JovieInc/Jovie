import type { Metadata } from 'next';
import { APP_NAME } from '@/constants/app';

const BRAND_WORD = new RegExp(`\\b${APP_NAME}\\b`, 'i');

/**
 * Root layout titles use `%s | Jovie`. A title that already names the brand
 * must opt out, or the tab reads `Compare — Jovie | Jovie`.
 */
export function documentTitle(title: string): string | { absolute: string } {
  const trimmed = title.trim();
  if (BRAND_WORD.test(trimmed)) return { absolute: trimmed };
  return trimmed;
}

/** Apply the root title template the way Next.js does for a child title. */
export function applyRootTitleTemplate(
  title: Metadata['title'] | null | undefined
): string {
  if (typeof title === 'string') {
    const trimmed = title.trim();
    return trimmed.length === 0 ? APP_NAME : `${trimmed} | ${APP_NAME}`;
  }
  if (
    title &&
    typeof title === 'object' &&
    'absolute' in title &&
    typeof title.absolute === 'string'
  ) {
    return title.absolute.trim();
  }
  if (
    title &&
    typeof title === 'object' &&
    'default' in title &&
    typeof title.default === 'string'
  ) {
    return title.default.trim();
  }
  return APP_NAME;
}
