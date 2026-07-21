import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';

export default function PlaylistsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PublicPageShell
      className='system-b-marketing dark overflow-x-clip bg-base text-primary-token'
      logoSize='xs'
    >
      {children}
      <MarketingEnhancements />
      <div aria-hidden='true' className='marketing-noise' />
    </PublicPageShell>
  );
}
