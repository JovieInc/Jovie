import './home.css';
import '../../components/marketing/MarketingSnapRail.css';
import { WebMcpTools } from '@/components/marketing/WebMcpTools';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { APP_ROUTES } from '@/constants/routes';
import { resolveMarketingHeaderBrand } from '@/data/marketing/headerBrand';
import { HOME_MARKETING_HEADER_CTA } from '@/data/marketing/headerCta';
import { getMarketingPageContractForRouteGlob } from '@/data/marketing/pageContracts';
import { getSiteChrome } from '@/lib/content-records/site-chrome.server';

export const revalidate = false;

// The homepage is statically prerendered, and its server-side usePathname()
// is not "/" (the markup shipped without the page-contract markers and with
// the default /signup CTA and an extra footer CTA). The browser then rendered both from "/" and React
// threw hydration error #418 on every visit. Resolve the route-owned values
// here, once, so the server and the client render identical markup.
const HOME_HEADER_CTA = HOME_MARKETING_HEADER_CTA;
const HOME_HEADER_BRAND = resolveMarketingHeaderBrand(APP_ROUTES.HOME);
const HOME_PAGE_CONTRACT =
  getMarketingPageContractForRouteGlob('(home)/page.tsx') ?? undefined;

export default async function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chrome = await getSiteChrome();
  // The homepage uses the one canonical marketing shell: the docked
  // landing header (with the Customers flyout) and the full footer. The
  // hero opts into `marketing-hero-dock`, so its cinematic field bleeds
  // under the docked header to y=0 while the shell's header offset keeps
  // the rest of the page below the fixed bar.
  return (
    <ClientProviders forceSignedOutDefaults>
      <PublicPageShell
        chrome={chrome}
        className='home-viewport home-viewport--hero-canvas min-h-svh overflow-x-clip bg-base text-primary-token'
        footerShowCta={false}
        footerVariant='expanded'
        headerBrand={HOME_HEADER_BRAND}
        headerCta={HOME_HEADER_CTA}
        logoSize='sm'
        pageContract={HOME_PAGE_CONTRACT}
      >
        {children}
        <WebMcpTools />
      </PublicPageShell>
    </ClientProviders>
  );
}
