import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthLinkProps {
  href: string;
  children: ReactNode;
}

export function AuthLink({ href, children }: AuthLinkProps) {
  return (
    <Link
      href={href}
      className='text-primary-token hover:underline font-medium focus-ring-themed focus-visible:ring-offset-(--color-bg-base) rounded-md'
    >
      {children}
    </Link>
  );
}
