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
      className='public-legal-shell bg-base text-primary-token'
      headerVariant='minimal'
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
