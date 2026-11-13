// Chrome CSS is owned by the layouts that render the marketing chrome, not by
// the root layout (which would ship it to every route). Keep it ahead of the
// route styles so the cascade order matches the former root-layout import.
import '@/components/organisms/HeaderNav.css';
import '@/components/site/MarketingFooter.css';
import '../(home)/home.css';
import '../../components/marketing/MarketingSnapRail.css';
import '../../components/marketing/artist-profile/ArtistProfileLandingPage.css';
import { MarketingEmailSignup } from '@/components/marketing/MarketingEmailSignup';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';

export const revalidate = false;

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chrome = await getSiteChrome();
  return (
    <ClientProviders forceSignedOutDefaults>
      <PublicPageShell
        chrome={chrome}
        className='system-b-marketing overflow-x-clip bg-base text-primary-token'
        logoSize='xs'
      >
        {children}
        <MarketingEmailSignup />
        <MarketingEnhancements />
        <div aria-hidden='true' className='marketing-noise' />
      </PublicPageShell>
    </ClientProviders>
  );
}
