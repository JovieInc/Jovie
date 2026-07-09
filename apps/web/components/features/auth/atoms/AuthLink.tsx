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
      className='text-app font-normal text-(--color-bg-surface-2) dark:text-(--color-bg-button) underline focus-ring-themed rounded-md'
    >
      {children}
    </Link>
  );
}
