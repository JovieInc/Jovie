import { SkipToContent } from '@/components/atoms/SkipToContent';
import { cn } from '@/lib/utils';
import { MarketingFooter } from './MarketingFooter';
import {
  MarketingHeader,
  type MarketingHeaderNavLink,
  type MarketingHeaderVariant,
} from './MarketingHeader';
import { PUBLIC_SHELL_MAIN_OFFSET_CLASS } from './public-shell.constants';

export interface PublicPageShellProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly headerVariant?: MarketingHeaderVariant;
  readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  readonly mainClassName?: string;
  readonly navLinks?: readonly MarketingHeaderNavLink[];
  readonly skipToContent?: boolean;
}

export function PublicPageShell({
  children,
  className,
  headerVariant = 'landing',
  logoSize = 'xs',
  mainClassName,
  navLinks,
  skipToContent = true,
}: Readonly<PublicPageShellProps>) {
  return (
    <div className={cn('flex min-h-screen flex-col', className)}>
      {skipToContent ? <SkipToContent /> : null}
      <MarketingHeader
        logoSize={logoSize}
        navLinks={navLinks}
        variant={headerVariant}
      />
      <main
        id='main-content'
        className={cn(
          'flex flex-1 flex-col',
          PUBLIC_SHELL_MAIN_OFFSET_CLASS,
          mainClassName
        )}
      >
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
