import '../(home)/home.css';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';

export const revalidate = false;

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PublicPageShell
      className='dark linear-marketing overflow-x-clip bg-black text-primary-token'
      logoSize='xs'
    >
      {children}
      <MarketingEnhancements />
      <div aria-hidden='true' className='marketing-noise' />
    </PublicPageShell>
  );
}
