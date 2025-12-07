import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthLinkProps {
  href: string;
  children: ReactNode;
}

export function AuthLink({ href, children }: AuthLinkProps) {
  return (
    <Link href={href} className='text-white hover:underline font-medium'>
      {children}
    </Link>
  );
}
