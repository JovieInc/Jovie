import { MarketingContainer } from '@/components/marketing';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';

export const revalidate = false;

/**
 * One shell for every legal document (/legal/privacy, /legal/terms,
 * /legal/cookies, /legal/dmca): the full docked marketing header, the
 * expanded footer, and no route hero. The document's own H1 (LegalHero) is
 * the single title and focal point; a texture hero above it repeated the
 * title over off-palette wallpaper (2026-10-29 marketing critic sweep).
 */
export default async function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
