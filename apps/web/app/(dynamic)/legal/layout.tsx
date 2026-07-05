import { MarketingContainer } from '@/components/marketing';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export const revalidate = false;

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PublicPageShell
      className='public-legal-shell bg-white text-neutral-950 dark:bg-base dark:text-neutral-50'
      headerVariant='minimal'
      logoSize='sm'
      mainClassName='py-16 sm:py-20'
    >
      <MarketingContainer width='page'>{children}</MarketingContainer>
    </PublicPageShell>
  );
}
