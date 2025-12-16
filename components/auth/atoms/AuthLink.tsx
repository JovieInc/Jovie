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
      className='text-white hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10] rounded'
    >
      {children}
    </Link>
  );
}
