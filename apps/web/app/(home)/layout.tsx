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
  // The hero canvas replaces the docked marketing header with its own
  // bar and hides that header. Skip the shell's header offset so the
  // 100svh field starts at the top of the viewport.
  return (
    <ClientProviders forceSignedOutDefaults>
      <PublicPageShell
        className='home-viewport home-viewport--hero-canvas min-h-svh overflow-x-clip bg-base text-primary-token'
        footerVariant='expanded'
        logoSize='sm'
        mainOffset={false}
      >
        {children}
      </PublicPageShell>
    </ClientProviders>
  );
}
