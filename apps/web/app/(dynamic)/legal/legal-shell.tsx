import type { ReactNode } from 'react';
import { MarketingContainer } from '@/components/marketing';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';

/**
 * One shell for every legal document (/legal/privacy, /legal/terms,
 * /legal/cookies, /legal/dmca): the full docked marketing header, the
 * expanded footer, and no route hero. The document's own H1 (LegalHero) is
 * the single title and focal point; a texture hero above it repeated the
 * title over off-palette wallpaper (2026-10-29 marketing critic sweep).
 *
 * Each legal route renders it from its own layout rather than the shared
 * `legal/layout.tsx`: hoisting the shell into the segment layout regrouped
 * client chunks and pushed /demo and /p/[token] over their first-load JS
 * budgets (bisected on a production build, 2026-11-01).
 */
export async function LegalDocumentShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  const chrome = await getSiteChrome();
  return (
    <PublicPageShell
      chrome={chrome}
      className='public-legal-shell bg-base text-primary-token'
      footerVariant='expanded'
      logoSize='sm'
    >
      <MarketingContainer
        className='public-legal-content py-16 sm:py-20'
        width='page'
      >
        {children}
      </MarketingContainer>
    </PublicPageShell>
  );
}
