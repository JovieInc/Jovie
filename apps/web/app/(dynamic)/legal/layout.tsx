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
      className='bg-white text-neutral-950 dark:bg-[#0a0a0b] dark:text-neutral-50'
      headerVariant='minimal'
      logoSize='sm'
      mainClassName='py-16 sm:py-20'
    >
      <MarketingContainer width='page'>{children}</MarketingContainer>
    </PublicPageShell>
  );
}
