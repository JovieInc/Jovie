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
}: AuthFooterLinkProps) {
  return (
    <div className='text-center text-sm text-zinc-400'>
      {prompt} <AuthLink href={href}>{linkText}</AuthLink>
    </div>
  );
}
