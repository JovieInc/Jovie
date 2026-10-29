import type { MarketingHeaderChromeNav } from '@/components/site/MarketingHeader';
import type {
  MarketingFooterColumn,
  MarketingFooterLink,
} from '@/data/marketingNavigation';
import type { SiteChrome } from './site-chrome';

// Kept apart from site-chrome.defaults.ts on purpose: that file is pure data
// (the design-surfaces invariant parses it for label/destination binding), and
// this resolver builds link objects from variables.

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
