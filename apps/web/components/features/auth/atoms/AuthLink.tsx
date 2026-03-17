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
      className='text-[13px] font-[400] text-[#1f2023] dark:text-[#e3e4e6] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c78e6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5] dark:focus-visible:ring-offset-[#090909] rounded-md'
    >
      {children}
    </Link>
  );
}
