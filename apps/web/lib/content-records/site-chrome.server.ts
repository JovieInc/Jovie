import 'server-only';
import type { MarketingHeaderChromeNav } from '@/components/site/MarketingHeader';
import type {
  MarketingFooterColumn,
  MarketingFooterLink,
} from '@/data/marketingNavigation';
import { SITE_CHROME_KIND, type SiteChrome } from './site-chrome';
import { getLiveContent } from './store.server';

/** Serializable chrome props for the shared public shell. */
export interface ResolvedSiteChrome {
  readonly nav: MarketingHeaderChromeNav;
  readonly footerColumns: readonly MarketingFooterColumn[];
  readonly legalLinks: readonly MarketingFooterLink[];
}

export function toResolvedSiteChrome(chrome: SiteChrome): ResolvedSiteChrome {
  return {
    nav: {
      primary: chrome.nav.primary.map(({ href, label }) => ({ href, label })),
      customers: chrome.nav.customers.map(({ href, label }) => ({
        href,
        label,
      })),
    },
    legalLinks: chrome.footer.legal.map(({ href, label }) => ({ href, label })),
    footerColumns: chrome.footer.columns.map(column => ({
      title: column.title,
      links: column.links.map(({ href, label }) => ({
        href,
        label,
        external: /^https?:\/\//i.test(href) || undefined,
      })),
    })),
  };
}

/**
 * The published site chrome (header nav + footer), or the code default.
 * Cached per record tag, so a publish goes live without a deploy and steady
 * state renders issue no database reads.
 */
export async function getSiteChrome(): Promise<ResolvedSiteChrome> {
  const live = await getLiveContent(SITE_CHROME_KIND, 'main');
  return toResolvedSiteChrome(live.data);
}
