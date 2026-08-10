// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import './ArtistProfileOutcomesCarousel.css';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

const OUTCOME_RESULTS = {
  'straight-to-listen': 'Listen Comes First',
  'local-dates-first': 'Nearby Show Leads',
  'support-without-friction': 'Support Stays Simple',
  'capture-the-fan': 'Fan Opts In',
  'one-link-everywhere': 'One Link Stays',
} as const;

export function ArtistProfileOutcomesCarousel({
  outcomes,
}: Readonly<ArtistProfileOutcomesCarouselProps>) {
  const ledgerRows = outcomes.landingCards.slice(0, 4);

  return (
    <ArtistProfileSectionShell
      className='ap-outcomes'
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.featureGrid}
    >
      <div className='mx-auto max-w-public-content'>
        <ArtistProfileSectionHeader
          align='left'
          headline={outcomes.headline}
          body={outcomes.body}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />

        <div
          data-testid='artist-profile-outcomes-scroller'
          className='hidden'
          aria-hidden='true'
        />
        <ol
          data-testid='artist-profile-outcomes-grid'
          className='ap-outcomes__ledger mt-10 border-t border-subtle'
          aria-label='Fan Outcomes'
        >
          {ledgerRows.map((outcome, index) => (
            <li
              key={outcome.id}
              data-testid='artist-profile-outcome-card'
              className='ap-outcomes__row grid border-b border-subtle py-5 sm:py-6'
            >
              <span className='ap-outcomes__index font-mono text-3xs text-tertiary-token'>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className='ap-outcomes__title text-xl font-semibold text-primary-token sm:text-2xl'>
                {outcome.title}
              </h3>
              <p className='ap-outcomes__description text-app leading-relaxed text-secondary-token'>
                {outcome.description}
              </p>
              <p className='ap-outcomes__result font-mono text-xs font-semibold text-primary-token'>
                {OUTCOME_RESULTS[outcome.id]}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </ArtistProfileSectionShell>
  );
}
