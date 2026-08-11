import type { LogoVariant } from '@/components/atoms/Logo';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { cn } from '@/lib/utils';
import { MarketingFooter } from './MarketingFooter';
import {
  MarketingHeader,
  type MarketingHeaderCta,
  type MarketingHeaderNavLink,
  type MarketingHeaderVariant,
} from './MarketingHeader';
import { PUBLIC_SHELL_MAIN_OFFSET_CLASS } from './public-shell.constants';

export interface PublicPageShellProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly footerClassName?: string;
  readonly footerVariant?: 'auto' | 'expanded' | 'minimal';
  readonly headerVariant?: MarketingHeaderVariant;
  readonly headerCta?: MarketingHeaderCta;
  readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  readonly logoVariant?: LogoVariant;
  readonly mainClassName?: string;
  /**
   * Apply the fixed-header top offset to <main>. The homepage hero owns its
   * own spacing, so the (home) layout opts out.
   */
  readonly mainOffset?: boolean;
  readonly navLinks?: readonly MarketingHeaderNavLink[];
  readonly showHomepageCenterNav?: boolean;
  readonly skipToContent?: boolean;
}

export function PublicPageShell({
  children,
  className,
  footerClassName,
  footerVariant,
  headerCta,
  headerVariant = 'landing',
  logoSize = 'xs',
  logoVariant,
  mainClassName,
  mainOffset = true,
  navLinks,
  showHomepageCenterNav,
  skipToContent = true,
}: Readonly<PublicPageShellProps>) {
  return (
    <div
      className={cn('flex min-h-screen flex-col', className)}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.publicPage}
    >
      {skipToContent ? <SkipToContent /> : null}
      <MarketingHeader
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
          mainOffset ? PUBLIC_SHELL_MAIN_OFFSET_CLASS : undefined,
          mainClassName
        )}
      >
        {children}
      </main>
      <MarketingFooter className={footerClassName} variant={footerVariant} />
    </div>
  );
}
