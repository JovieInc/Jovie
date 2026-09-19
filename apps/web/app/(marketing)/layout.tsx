import '../(home)/home.css';
import '../../components/marketing/MarketingSnapRail.css';
import '../../components/marketing/artist-profile/ArtistProfileLandingPage.css';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';

export const revalidate = false;

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClientProviders forceSignedOutDefaults>
      <PublicPageShell
        className='system-b-marketing overflow-x-clip bg-base text-primary-token'
        logoSize='xs'
      >
        {children}
        <MarketingEnhancements />
        <div aria-hidden='true' className='marketing-noise' />
      </PublicPageShell>
    </ClientProviders>
  );
}
