import Link from 'next/link';
import { cn } from '@/lib/utils';

const baseStyles = 'transition-colors';
const variantStyles = {
  light:
    'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
  dark: 'text-white/60 hover:text-white',
} as const;

function isExternal(href: string) {
  return /^https?:\/\//.test(href);
}

interface FooterLinkProps {
  href: string;
  children: React.ReactNode;
  variant?: 'light' | 'dark';
  className?: string;
}

export function FooterLink({
  href,
  children,
  variant = 'dark',
  className = '',
}: FooterLinkProps) {
  const external = isExternal(href);

  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={cn(baseStyles, variantStyles[variant], className)}
    >
      {children}
    </Link>
  );
}
