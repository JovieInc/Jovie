import type { MarketingHeaderChromeNav } from '@/components/site/MarketingHeader';
import type {
  MarketingFooterColumn,
  MarketingFooterLink,
} from '@/data/marketingNavigation';
import type { SiteChrome } from './site-chrome';

// Apart from site-chrome.defaults.ts so that file stays literal data (the nav
// invariant parses it).

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
