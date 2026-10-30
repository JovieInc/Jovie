import type { AnyContentKind } from './kind';
import { MARKETING_PAGE_KIND } from './marketing-page';
import { PAGE_SPEC_KIND } from './page-spec';
import { pageSpecSmoke } from './page-spec.smoke';
import { SITE_CHROME_KIND } from './site-chrome';
import { siteChromeSmoke } from './site-chrome.smoke';

/**
 * Every content kind the store accepts. Adding a kind here is the whole
 * integration: store, preview, publish, audit log, and rollback come free.
 */
export const CONTENT_KINDS: readonly AnyContentKind[] = [
  MARKETING_PAGE_KIND as AnyContentKind,
  { ...PAGE_SPEC_KIND, smoke: pageSpecSmoke } as AnyContentKind,
  { ...SITE_CHROME_KIND, smoke: siteChromeSmoke } as AnyContentKind,
];

export function getContentKind(kind: string): AnyContentKind | null {
  return CONTENT_KINDS.find(definition => definition.kind === kind) ?? null;
}
