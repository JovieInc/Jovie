import Link from 'next/link';
import { Logo, type LogoVariant } from '@/components/atoms/Logo';
import { cn } from '@/lib/utils';

interface LogoLinkProps {
  href?: string;
  className?: string;
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: LogoVariant;
}

export function LogoLink({
  href = '/',
  className,
  logoSize = 'sm',
  variant = 'word',
}: LogoLinkProps) {
  return (
    <Link
      href={href}
      className={cn('flex items-center space-x-2', className)}
      aria-label='Jovie'
    >
      <Logo size={logoSize} variant={variant} />
    </Link>
  );
}
