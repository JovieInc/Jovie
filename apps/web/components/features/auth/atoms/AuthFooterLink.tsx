import type { ReactNode } from 'react';
import { AuthLink } from './AuthLink';

interface AuthFooterLinkProps {
  readonly prompt: string;
  readonly href: string;
  readonly linkText: ReactNode;
}

export function AuthFooterLink({
  prompt,
  href,
  linkText,
}: Readonly<AuthFooterLinkProps>) {
  return (
    <div className='text-center text-app font-normal text-(--color-text-quaternary-token) dark:text-(--color-accent-gray)'>
      {prompt} <AuthLink href={href}>{linkText}</AuthLink>
    </div>
  );
}
