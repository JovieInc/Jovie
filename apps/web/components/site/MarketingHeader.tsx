import Link from 'next/link';
import { LogoLink } from '@/components/atoms/LogoLink';

export type MarketingHeaderVariant = 'landing' | 'content' | 'minimal';

export interface MarketingHeaderProps
  extends Readonly<{
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly variant?: MarketingHeaderVariant;
  }> {}

/**
 * Marketing header with a static public auth shell.
 */
export function MarketingHeader({
  logoSize = 'xs',
  variant = 'landing',
}: MarketingHeaderProps) {
  const hideAuth = variant === 'minimal';

  return (
    <header
      className='fixed left-0 right-0 top-0 z-100 w-full border-b'
      style={{
        backgroundColor: 'var(--linear-bg-header)',
        borderBottomColor: 'var(--linear-border-default)',
        color: 'var(--linear-text-primary)',
      }}
    >
      <nav
        className='mx-auto flex h-[var(--linear-header-height)] w-full max-w-[var(--linear-content-max)] items-center gap-3 px-5 sm:gap-4 sm:px-6 md:gap-6 lg:px-0'
        aria-label='Primary navigation'
      >
        <div className='flex items-center'>
          <LogoLink
            logoSize={logoSize}
            variant='word'
            className='rounded-md'
            data-testid='site-logo'
          />
        </div>
        <div className='flex-1' aria-hidden='true' />
        {hideAuth ? null : (
          <div className='flex items-center gap-1'>
            <Link href='/signin' className='btn-linear-login focus-ring-themed'>
              Log in
            </Link>
            <Link
              href='/signup'
              className='btn-linear-signup focus-ring-themed'
            >
              Sign up
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
