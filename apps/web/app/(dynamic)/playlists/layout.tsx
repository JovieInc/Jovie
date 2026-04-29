import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';

export default function PlaylistsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PublicPageShell
      className='dark marketing-system overflow-x-clip bg-black text-primary-token'
      logoSize='xs'
    >
      {children}
      <MarketingEnhancements />
      <div aria-hidden='true' className='marketing-noise' />
    </PublicPageShell>
  );
}
