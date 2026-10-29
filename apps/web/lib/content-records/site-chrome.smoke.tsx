import { isValidElement, type ReactNode } from 'react';
import { FooterColumnsNav } from '@/components/site/MarketingFooter';
import type { SiteChrome } from './site-chrome';
import { toResolvedSiteChrome } from './site-chrome.server';

/**
 * Render smoke test for the site-chrome publish gate: draw the footer
 * through the real footer renderer and confirm every column title, label and
 * destination reached the markup. Catches a record that validates but cannot
 * render (a renderer that throws, drops a column, or rewrites a link).
 */
/**
 * Expand the footer element tree through the real renderer's function
 * components and collect the text and destinations it would emit. Walks the
 * tree instead of calling react-dom/server, which Next forbids in route graphs.
 */
function collect(node: ReactNode, text: Set<string>, hrefs: Set<string>): void {
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') {
    text.add(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, text, hrefs);
    return;
  }
  if (!isValidElement(node)) return;
  const props = node.props as { href?: unknown; children?: ReactNode };
  if (typeof props.href === 'string') hrefs.add(props.href);
  if (typeof node.type === 'function' && typeof props.href !== 'string') {
    collect((node.type as (p: unknown) => ReactNode)(node.props), text, hrefs);
    return;
  }
  collect(props.children, text, hrefs);
}

export function siteChromeSmoke(chrome: SiteChrome): string[] {
  const resolved = toResolvedSiteChrome(chrome);
  const text = new Set<string>();
  const hrefs = new Set<string>();
  collect(
    <FooterColumnsNav columns={resolved.footerColumns} hasCta={false} />,
    text,
    hrefs
  );
  const errors: string[] = [];
  for (const column of chrome.footer.columns) {
    if (!text.has(column.title)) {
      errors.push(`footer.${column.id}.title: did not render`);
    }
    for (const link of column.links) {
      if (!hrefs.has(link.href) || !text.has(link.label)) {
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
