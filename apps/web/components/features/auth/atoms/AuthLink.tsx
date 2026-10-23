import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthLinkProps {
  readonly href: string;
  readonly children: ReactNode;
}

export function AuthLink({ href, children }: Readonly<AuthLinkProps>) {
  return (
    <Link
      href={href}
      className='text-app font-normal text-primary-token underline focus-ring-themed rounded-md'
    >
      {children}
    </Link>
  );
}
