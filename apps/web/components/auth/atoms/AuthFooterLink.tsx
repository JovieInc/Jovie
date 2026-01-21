import type { ReactNode } from 'react';
import { AuthLink } from './AuthLink';

interface AuthFooterLinkProps {
  prompt: string;
  href: string;
  linkText: ReactNode;
}

export function AuthFooterLink({
  prompt,
  href,
  linkText,
}: Readonly<AuthFooterLinkProps>) {
  return (
    <div className='text-center text-[13px] font-[450] text-[#6b6f76] dark:text-[#969799]'>
      {prompt} <AuthLink href={href}>{linkText}</AuthLink>
    </div>
  );
}
