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
      className='text-[13px] font-[400] text-[#1f2023] dark:text-[#e3e4e6] underline focus-ring-themed rounded-md'
    >
      {children}
    </Link>
  );
}
