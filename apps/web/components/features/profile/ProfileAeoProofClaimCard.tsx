import { ArrowRight } from 'lucide-react';
import { ProofClaimCtaLink } from '@/features/profile/ProofClaimCtaLink';

export interface ProfileAeoProofClaimCardProps {
  readonly artistName: string;
  readonly href: string;
  readonly label: string;
  readonly note: string;
}

export function ProfileAeoProofClaimCard({
  artistName,
  href,
  label,
  note,
}: ProfileAeoProofClaimCardProps) {
  return (
    <section
      aria-labelledby='profile-aeo-proof-claim-heading'
      className='profile-aeo-content px-4 pb-10 sm:px-6 lg:px-8 lg:pb-14'
      data-testid='profile-aeo-proof-claim'
    >
      <div className='mx-auto max-w-5xl'>
        <aside
          aria-labelledby='profile-aeo-proof-claim-heading'
          className='profile-aeo-claim-card relative overflow-hidden rounded-3xl border p-6 sm:p-8 lg:p-9'
          data-testid='profile-aeo-claim-card'
        >
          <div className='relative flex flex-col gap-8 sm:gap-10'>
            {/* eslint-disable @jovie/canonical-ui-label-casing -- Canonical URLs are lowercase. */}
            <h2
              id='profile-aeo-proof-claim-heading'
              className='profile-aeo-claim-card__heading font-display font-semibold'
              aria-label='jov.ie/you'
            >
              <span className='profile-aeo-claim-card__domain'>jov.ie/</span>
              <span>you</span>
            </h2>
            {/* eslint-enable @jovie/canonical-ui-label-casing */}

            <div className='flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between'>
              <p className='profile-aeo-claim-card__note text-xs font-medium'>
                {note}
              </p>
              <ProofClaimCtaLink
                href={href}
                label={label}
                ariaLabel={`${label} — get your Jovie from the ${artistName} profile`}
                testId='profile-aeo-claim-cta'
                className='profile-aeo-claim-card__cta inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-6 text-sm font-semibold transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--profile-aeo-claim-ink) focus-visible:ring-offset-2'
              >
                {label}
                <ArrowRight className='size-4' aria-hidden='true' />
              </ProofClaimCtaLink>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
