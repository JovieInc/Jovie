'use client';

import Link from 'next/link';
import {
  ProofClaimCtaLink,
  proofClaimFooterClassName,
} from '@/features/profile/ProofClaimCtaLink';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

export interface ProfileClaimFooterProps {
  readonly href: string;
  readonly className?: string;
  /** When false, hide for owners / claimed-by-viewer surfaces. Default true. */
  readonly enabled?: boolean;
  /** Taste-safe label. Proof profiles use Request access / Get yours. */
  readonly label?: string;
  /** When true, clicks emit the proof-to-claim funnel event. */
  readonly proofClaim?: boolean;
}

/**
 * Desktop spare-space growth footer under the public profile card.
 * Hidden on mobile and for authenticated viewers (JOV-3544).
 */
export function ProfileClaimFooter({
  href,
  className,
  enabled = true,
  label = 'Claim Your Profile',
  proofClaim = false,
}: ProfileClaimFooterProps) {
  const isAuthenticated = useIsAuthenticated();

  if (!enabled || isAuthenticated) {
    return null;
  }

  const content = (
    <>
      <span className='text-white/70' aria-hidden='true'>
        Jovie
      </span>
      <span className='text-white/30' aria-hidden='true'>
        ·
      </span>
      <span>{label}</span>
    </>
  );

  return (
    <div
      className={cn('hidden w-full justify-center pt-4 md:flex', className)}
      data-testid='profile-claim-footer'
    >
      {proofClaim ? (
        <ProofClaimCtaLink
          href={href}
          label={label}
          className={proofClaimFooterClassName()}
          testId='profile-claim-footer-cta'
        >
          {content}
        </ProofClaimCtaLink>
      ) : (
        <Link
          href={href}
          className={proofClaimFooterClassName()}
          data-testid='profile-claim-footer-cta'
          onClick={() => {
            track('profile_claim_footer_click', {
              destination: href,
            });
          }}
        >
          {content}
        </Link>
      )}
    </div>
  );
}
