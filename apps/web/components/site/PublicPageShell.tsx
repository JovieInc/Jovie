import Link from 'next/link';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { COPYRIGHT_YEAR } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import {
  MarketingHeader,
  type MarketingHeaderVariant,
} from './MarketingHeader';
import { PUBLIC_SHELL_MAIN_OFFSET_CLASS } from './public-shell.constants';

export interface PublicPageShellProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly headerVariant?: MarketingHeaderVariant;
  readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  readonly mainClassName?: string;
  readonly skipToContent?: boolean;
}

export function PublicPageShell({
  children,
  className,
  headerVariant = 'landing',
  logoSize = 'xs',
  mainClassName,
  skipToContent = true,
}: Readonly<PublicPageShellProps>) {
  return (
    <div className={cn('flex min-h-screen flex-col', className)}>
      {skipToContent ? <SkipToContent /> : null}
      <MarketingHeader logoSize={logoSize} variant={headerVariant} />
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
      <footer className='home-legal-bar'>
        <div className='mx-auto flex w-full max-w-[var(--linear-content-max)] items-center justify-between gap-4 px-5 pb-6 pt-3 text-[11px] tracking-[-0.01em] sm:px-6 lg:px-0'>
          <p className='text-secondary-token/72'>&copy; {COPYRIGHT_YEAR}</p>
          <nav className='flex items-center gap-3' aria-label='Legal'>
            <Link
              href={APP_ROUTES.LEGAL_PRIVACY}
              className='home-legal-link focus-ring-themed rounded-md px-1.5 py-0.5'
            >
              Privacy
            </Link>
            <Link
              href={APP_ROUTES.LEGAL_TERMS}
              className='home-legal-link focus-ring-themed rounded-md px-1.5 py-0.5'
            >
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
