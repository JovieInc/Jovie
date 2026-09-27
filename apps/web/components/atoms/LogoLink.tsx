import Link from 'next/link';
import { Logo, type LogoVariant } from '@/components/atoms/Logo';
import { cn } from '@/lib/utils';
import './LogoLink.css';

interface LogoLinkProps
  extends Readonly<{
    readonly href?: string;
    readonly className?: string;
    readonly logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    readonly prefetch?: boolean;
    readonly variant?: LogoVariant;
    /**
     * Icon-only chrome: hovering or focusing the link spins the mark 360°
     * and slides the "Jovie" wordmark out to its right; leaving reverses
     * both. CSS-only, so it adds no client JS. Reduced motion shows the
     * wordmark without the spin or slide.
     */
    readonly reveal?: boolean;
    readonly 'data-testid'?: string;
  }> {}

export function LogoLink({
  href = '/',
  className,
  logoSize = 'sm',
  prefetch,
  variant = 'word',
  reveal = false,
  'data-testid': dataTestId = 'site-logo',
}: LogoLinkProps) {
  const logo = (
    <Logo size={logoSize} variant={variant} data-testid={dataTestId} />
  );

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(
        'flex items-center',
        reveal ? 'logo-reveal' : 'space-x-2',
        className
      )}
      aria-label='Jovie'
      data-testid={`${dataTestId}-link`}
      data-logo-reveal={reveal ? 'true' : undefined}
    >
      {reveal ? (
        <>
          <span className='logo-reveal__mark' data-testid='logo-reveal-mark'>
            {logo}
          </span>
          <span
            aria-hidden='true'
            className='logo-reveal__wordmark'
            data-testid='logo-reveal-wordmark'
          >
            Jovie
          </span>
        </>
      ) : (
        logo
      )}
    </Link>
  );
}
