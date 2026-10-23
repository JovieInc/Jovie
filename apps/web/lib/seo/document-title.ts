import type { Metadata } from 'next';
import { APP_NAME } from '@/constants/app';

/**
 * Root layout titles use `%s | Jovie`. A title that already names the brand
 * must opt out, or the tab reads `Compare — Jovie | Jovie`.
 *
 * The check is a literal, not `APP_NAME` at module init. Route tests often
 * stub `@/constants/app` with only `BASE_URL`, and a missing export throws
 * while the page module is still loading. `applyRootTitleTemplate` still
 * appends `APP_NAME`, and the unit test locks that constant to this word.
 */
const BRAND_WORD = /\bJovie\b/i;

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
