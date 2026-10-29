import { renderToStaticMarkup } from 'react-dom/server';
import { FooterColumnsNav } from '@/components/site/MarketingFooter';
import type { SiteChrome } from './site-chrome';
import { toResolvedSiteChrome } from './site-chrome.server';

/**
 * Render smoke test for the site-chrome publish gate: draw the footer
 * through the real footer renderer and confirm every column title, label and
 * destination reached the markup. Catches a record that validates but cannot
 * render (a renderer that throws, drops a column, or rewrites a link).
 */
export function siteChromeSmoke(chrome: SiteChrome): string[] {
  const resolved = toResolvedSiteChrome(chrome);
  const html = renderToStaticMarkup(
    <FooterColumnsNav columns={resolved.footerColumns} hasCta={false} />
  );
  const errors: string[] = [];
  for (const column of chrome.footer.columns) {
    if (!html.includes(`>${column.title}<`)) {
      errors.push(`footer.${column.id}.title: did not render`);
    }
    for (const link of column.links) {
      if (
        !html.includes(`href="${link.href}"`) ||
        !html.includes(`>${link.label}<`)
      ) {
        errors.push(`footer.${column.id}.${link.id}: did not render`);
      }
    }
  }
  for (const required of ['/legal/privacy', '/legal/terms']) {
    if (!chrome.footer.legal.some(link => link.href === required)) {
      errors.push(`footer.legal: ${required} missing`);
    }
  }
  return errors;
}
