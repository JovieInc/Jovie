import 'server-only';
import {
  type ResolvedSiteChrome,
  SITE_CHROME_KIND,
  toResolvedSiteChrome,
} from './site-chrome';
import { getLiveContent } from './store.server';

export { type ResolvedSiteChrome, toResolvedSiteChrome };

/**
 * The published site chrome (header nav + footer), or the code default.
 * Cached per record tag, so a publish goes live without a deploy and steady
 * state renders issue no database reads.
 */
export async function getSiteChrome(): Promise<ResolvedSiteChrome> {
  const live = await getLiveContent(SITE_CHROME_KIND, 'main');
  return toResolvedSiteChrome(live.data);
}
