/**
 * Core servers must not scrape social-network HTML from Jovie IPs.
 * Official public APIs stay allowed. A future isolated provider can be
 * selected with FEATURE_SOCIAL_HTML_ISOLATED_PROVIDER; until that provider
 * exists, both flag states fail closed.
 */

import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { ExtractionError } from '@/lib/ingestion/strategies/base/types';

const SOCIAL_HTML_ROOTS = [
  'instagram.com',
  'linktr.ee',
  'linktree.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
] as const;

const SOCIAL_HTML_PREFIXES = ['www.', 'm.', 'vm.', 'mobile.', 'l.'] as const;

export function isCoreSocialHtmlHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return SOCIAL_HTML_ROOTS.some(
    root =>
      host === root ||
      SOCIAL_HTML_PREFIXES.some(prefix => host === `${prefix}${root}`)
  );
}

export function coreSocialHtmlFetchBlockMessage(): string {
  if (isCodeFlagEnabled('SOCIAL_HTML_ISOLATED_PROVIDER')) {
    return 'Social HTML fetch is disabled: isolated provider is not configured';
  }
  return 'Social HTML fetch is disabled';
}

export function rejectCoreSocialHtmlFetch(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }
  if (!isCoreSocialHtmlHost(hostname)) return;
  throw new ExtractionError(
    coreSocialHtmlFetchBlockMessage(),
    'SOCIAL_HTML_DISABLED'
  );
}

export function disabledSocialHtmlDocument(): never {
  throw new ExtractionError(
    coreSocialHtmlFetchBlockMessage(),
    'SOCIAL_HTML_DISABLED'
  );
}
