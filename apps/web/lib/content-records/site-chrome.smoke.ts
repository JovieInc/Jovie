import type { SiteChrome } from './site-chrome';
import { toResolvedSiteChrome } from './site-chrome.resolve';

/**
 * Resolution smoke test for the site-chrome publish gate: every nav link,
 * footer title, label and destination must survive the shell's resolver.
 * It does not draw the footer (a client component server code cannot call);
 * `site-chrome.test.tsx` renders the real footer against the default record.
 */
export function siteChromeSmoke(chrome: SiteChrome): string[] {
  const resolved = toResolvedSiteChrome(chrome);
  const errors: string[] = [];
  chrome.footer.columns.forEach((column, index) => {
    const drawn = resolved.footerColumns[index];
    if (!drawn || drawn.title !== column.title) {
      errors.push(`footer.${column.id}.title: did not resolve`);
      return;
    }
    for (const link of column.links) {
      const match = drawn.links.find(
        candidate =>
          candidate.href === link.href && candidate.label === link.label
      );
      if (!match)
        errors.push(`footer.${column.id}.${link.id}: did not resolve`);
    }
  });
  for (const group of ['primary', 'customers'] as const) {
    chrome.nav[group].forEach((link, index) => {
      const drawn = resolved.nav[group][index];
      if (drawn?.href !== link.href || drawn?.label !== link.label) {
        errors.push(`nav.${group}.${link.id}: did not resolve`);
      }
    });
  }
  for (const required of ['/legal/privacy', '/legal/terms']) {
    const drawn = resolved.legalLinks.some(link => link.href === required);
    if (!drawn) errors.push(`footer.legal: ${required} missing`);
  }
  return errors;
}
