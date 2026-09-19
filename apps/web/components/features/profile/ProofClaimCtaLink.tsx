'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  emitProofClaimEvent,
  rememberProofClaimAttribution,
} from '@/lib/acquisition/proof-claim-client';
import { PROOF_CLAIM_FUNNEL_EVENTS } from '@/lib/acquisition/proof-claim-funnel';
import { cn } from '@/lib/utils';

export interface ProofClaimCtaLinkProps {
  readonly href: string;
  readonly label: string;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly testId?: string;
  readonly children?: ReactNode;
}

export function ProofClaimCtaLink({
  href,
  label,
  className,
  ariaLabel,
  testId = 'proof-claim-cta',
  children,
}: ProofClaimCtaLinkProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      aria-label={ariaLabel ?? label}
      data-testid={testId}
      onClick={() => {
        rememberProofClaimAttribution();
        emitProofClaimEvent(PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED, {
          destination: href,
          label,
        });
      }}
    >
      {children ?? label}
    </Link>
  );
}

export function proofClaimFooterClassName(className?: string): string {
  return cn(
    'inline-flex items-center gap-2 text-sm font-medium tracking-normal text-white/55 transition-colors duration-subtle hover:text-white/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    className
  );
}
