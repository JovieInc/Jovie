import Link from 'next/link';
import { cn } from '@/lib/utils';

const baseClasses =
  'inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2';

const variantClasses = {
  default:
    'text-sm text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors',
  primary:
    'bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90 focus-visible:ring-gray-500 dark:focus-visible:ring-white/50 px-3 py-1.5 text-sm hover:scale-105',
};

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'primary';
  prefetch?: boolean;
  external?: boolean;
}

export function NavLink({
  href,
  children,
  className,
  variant = 'default',
  prefetch,
  external,
}: NavLinkProps) {
  if (external) {
    return (
      <a
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(baseClasses, variantClasses[variant], className)}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(baseClasses, variantClasses[variant], className)}
    >
      {children}
    </Link>
  );
}
