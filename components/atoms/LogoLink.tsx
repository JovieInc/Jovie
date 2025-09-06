import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';

interface LogoLinkProps {
  href?: string;
  className?: string;
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function LogoLink({
  href = '/',
  className,
  logoSize = 'sm',
}: LogoLinkProps) {
  return (
    <Link
      href={href}
      className={cn('flex items-center space-x-2', className)}
      aria-label='Jovie'
    >
      <Logo size={logoSize} />
    </Link>
  );
}
