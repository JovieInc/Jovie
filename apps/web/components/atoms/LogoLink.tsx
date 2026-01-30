import Link from 'next/link';
import { Logo, type LogoVariant } from '@/components/atoms/Logo';
import { cn } from '@/lib/utils';

interface LogoLinkProps
  extends Readonly<{
    href?: string;
    className?: string;
    logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    variant?: LogoVariant;
    'data-testid'?: string;
  }> {}

export function LogoLink({
  href = '/',
  className,
  logoSize = 'sm',
  variant = 'word',
  'data-testid': dataTestId = 'site-logo',
}: LogoLinkProps) {
  return (
    <Link
      href={href}
      className={cn('flex items-center space-x-2', className)}
      aria-label='Jovie'
      data-testid={`${dataTestId}-link`}
    >
      <Logo size={logoSize} variant={variant} data-testid={dataTestId} />
    </Link>
  );
}
