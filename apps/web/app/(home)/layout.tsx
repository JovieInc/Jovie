import './home.css';
import '../../components/marketing/MarketingSnapRail.css';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { PublicPageShell } from '@/components/site/PublicPageShell';

export const revalidate = false;

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The homepage uses the one canonical marketing shell: the docked
  // landing header (with the Customers flyout) and the full footer. The
  // hero opts into `marketing-hero-dock`, so its cinematic field bleeds
  // under the docked header to y=0 while the shell's header offset keeps
  // the rest of the page below the fixed bar.
  return (
    <ClientProviders forceSignedOutDefaults>
      <PublicPageShell
        className='home-viewport home-viewport--hero-canvas min-h-svh overflow-x-clip bg-base text-primary-token'
        footerVariant='expanded'
        logoSize='sm'
      >
        {children}
      </PublicPageShell>
    </ClientProviders>
  );
}
