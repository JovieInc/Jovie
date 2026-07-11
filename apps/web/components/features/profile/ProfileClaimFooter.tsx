'use client';

import Link from 'next/link';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

export interface ProfileClaimFooterProps {
  readonly href: string;
  readonly className?: string;
  /** When false, hide for owners / claimed-by-viewer surfaces. Default true. */
  readonly enabled?: boolean;
}

/**
 * Desktop spare-space growth footer under the public profile card.
 * Hidden on mobile and for authenticated viewers (JOV-3544).
 */
export function ProfileClaimFooter({
  href,
  className,
  enabled = true,
}: ProfileClaimFooterProps) {
  const isAuthenticated = useIsAuthenticated();

  if (!enabled || isAuthenticated) {
    return null;
  }

  return (
    <div
      className={cn('hidden w-full justify-center pt-4 md:flex', className)}
      data-testid='profile-claim-footer'
    >
      <Link
        href={href}
        className='inline-flex items-center gap-2 text-sm font-medium tracking-normal text-white/55 transition-colors duration-subtle hover:text-white/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
        data-testid='profile-claim-footer-cta'
        onClick={() => {
          track('profile_claim_footer_click', {
            destination: href,
          });
        }}
      >
        <span className='text-white/70' aria-hidden='true'>
          Jovie
        </span>
        <span className='text-white/30' aria-hidden='true'>
          ·
        </span>
        <span>Claim Your Profile</span>
      </Link>
    </div>
  );
}
