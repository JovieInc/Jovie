import type { LogoVariant } from '@/components/atoms/Logo';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import type { MarketingHeaderBrand } from '@/data/marketing/headerBrand';
import type { MarketingPageContract } from '@/data/marketing/pageContracts';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import type { ResolvedSiteChrome } from '@/lib/content-records/site-chrome.resolve';
import { cn } from '@/lib/utils';
import { MarketingFooter } from './MarketingFooter';
import {
  MarketingHeader,
  type MarketingHeaderCta,
  type MarketingHeaderNavLink,
  type MarketingHeaderVariant,
} from './MarketingHeader';
import { MarketingPageContractMarkers } from './MarketingPageContractMarkers';
import {
  PUBLIC_SHELL_MAIN_DOCKED_CLASS,
  PUBLIC_SHELL_MAIN_OFFSET_CLASS,
} from './public-shell.constants';

export interface PublicPageShellProps {
  readonly children: React.ReactNode;
  /** Published site chrome from `getSiteChrome()`; code default when omitted. */
  readonly chrome?: ResolvedSiteChrome;
  readonly className?: string;
  readonly footerClassName?: string;
  /** Set false when the route owns its final CTA (the homepage). */
  readonly footerShowCta?: boolean;
  readonly footerVariant?: 'auto' | 'expanded' | 'minimal';
  readonly headerVariant?: MarketingHeaderVariant;
  /** Overrides the per-page header brand config (icon-only vs lockup). */
  readonly headerBrand?: MarketingHeaderBrand;
  readonly headerCta?: MarketingHeaderCta;
  readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  readonly logoVariant?: LogoVariant;
  readonly mainClassName?: string;
  /**
   * Apply the fixed-header top offset to <main>. The homepage hero owns its
   * own spacing, so the (home) layout opts out. With the offset on, a
   * leading `.marketing-hero-dock` hero bleeds under the docked header.
   */
  readonly mainOffset?: boolean;
  readonly navLinks?: readonly MarketingHeaderNavLink[];
  /**
   * Route-owned page contract for the hidden markers. Pass it from layouts
   * whose SSR `usePathname()` is not the browser pathname (the homepage), so
   * server and client render the same markers.
   */
  readonly pageContract?: MarketingPageContract;
  readonly showHomepageCenterNav?: boolean;
  readonly skipToContent?: boolean;
}

export function PublicPageShell({
  children,
  chrome,
  className,
  footerClassName,
  footerShowCta,
  footerVariant,
  headerBrand,
  headerCta,
  headerVariant = 'landing',
  logoSize = 'xs',
  logoVariant,
  mainClassName,
  mainOffset = true,
  navLinks,
  pageContract,
  showHomepageCenterNav,
  skipToContent = true,
}: Readonly<PublicPageShellProps>) {
  return (
    <div
      // JOV-INV-032: svh avoids iOS Safari 100vh chrome jumps on public web.
      className={cn('flex min-h-svh flex-col', className)}
      data-public-page-shell
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.publicPage}
    >
      {skipToContent ? <SkipToContent /> : null}
      <MarketingHeader
        brand={headerBrand}
        chromeNav={chrome?.nav}
        logoSize={logoSize}
        logoVariant={logoVariant}
        navLinks={navLinks}
        primaryCta={headerCta}
        showHomepageCenterNav={showHomepageCenterNav}
        variant={headerVariant}
      />
      <main
        id='main-content'
        className={cn(
          'flex flex-1 flex-col',
          mainOffset
            ? [PUBLIC_SHELL_MAIN_OFFSET_CLASS, PUBLIC_SHELL_MAIN_DOCKED_CLASS]
            : undefined,
          mainClassName
        )}
      >
        <MarketingPageContractMarkers contract={pageContract} />
        {children}
      </main>
      <MarketingFooter
        className={footerClassName}
        columns={chrome?.footerColumns}
        showCta={footerShowCta}
        legalLinks={chrome?.legalLinks}
        variant={footerVariant}
      />
    </div>
  );
}
