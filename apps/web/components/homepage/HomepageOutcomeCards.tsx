import type { CSSProperties } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';

type HomepageOutcomeCopy = ArtistProfileLandingCopy['outcomes'];
type HomepageOutcomeCard = HomepageOutcomeCopy['cards'][number];
type HomepageOutcomeId = HomepageOutcomeCard['id'];

interface HomepageOutcomeCardsProps {
  readonly headline: string;
  readonly outcomes: HomepageOutcomeCopy;
  readonly className?: string;
}

const HOMEPAGE_OUTCOME_ACCENTS = {
  'drive-streams': '#0070f3',
  'sell-out': '#8f5cff',
  'get-paid': '#00b341',
  'share-anywhere': '#f5a623',
} satisfies Record<HomepageOutcomeId, string>;

const HOMEPAGE_OUTCOME_SIZE_CLASSES = {
  'drive-streams': 'homepage-outcome-card--drive-streams',
  'sell-out': 'homepage-outcome-card--sell-out',
  'get-paid': 'homepage-outcome-card--get-paid',
  'share-anywhere': 'homepage-outcome-card--share-anywhere',
} satisfies Record<HomepageOutcomeId, string>;

type OutcomeCardStyle = CSSProperties & {
  readonly '--outcome-accent': string;
};

export function HomepageOutcomeCards({
  headline,
  outcomes,
  className,
}: Readonly<HomepageOutcomeCardsProps>) {
  return (
    <section
      data-testid='homepage-outcome-cards'
      className={cn(
        'homepage-outcome-section relative w-full bg-black',
        className
      )}
      aria-labelledby='homepage-outcome-cards-heading'
    >
      <div className='homepage-outcome-inner mx-auto w-full'>
        <div className='homepage-outcome-header'>
          <h2
            id='homepage-outcome-cards-heading'
            className='homepage-outcome-heading text-white'
          >
            {headline}
          </h2>
        </div>
      </div>
      <div className='homepage-outcome-rail-bleed'>
        <section
          className='homepage-outcome-rail'
          data-testid='homepage-outcome-rail'
          aria-labelledby='homepage-outcome-cards-heading'
        >
          <a
            className='sr-only focus:not-sr-only focus-ring-themed'
            href='#homepage-outcome-card-share-anywhere'
          >
            Skip to final outcome card
          </a>
          {outcomes.cards.map(card => (
            <OutcomeCard key={card.id} card={card} outcomes={outcomes} />
          ))}
        </section>
      </div>
    </section>
  );
}

function OutcomeCard({
  card,
  outcomes,
}: Readonly<{
  card: HomepageOutcomeCard;
  outcomes: HomepageOutcomeCopy;
}>) {
  const style: OutcomeCardStyle = {
    '--outcome-accent': HOMEPAGE_OUTCOME_ACCENTS[card.id],
  };

  return (
    <article
      data-testid='homepage-outcome-card'
      id={`homepage-outcome-card-${card.id}`}
      className={cn(
        'homepage-outcome-card',
        HOMEPAGE_OUTCOME_SIZE_CLASSES[card.id]
      )}
      style={style}
    >
      <div aria-hidden='true' className='homepage-outcome-card__glow' />
      <div className='homepage-outcome-card__copy'>
        <h3 className='homepage-outcome-card__title'>{card.title}</h3>
      </div>

      <div className='homepage-outcome-card__visual' aria-hidden='true'>
        {card.id === 'drive-streams' ? (
          <DriveStreamsProof
            proof={outcomes.syntheticProofs.visualProofs.driveStreams}
          />
        ) : null}
        {card.id === 'sell-out' ? (
          <SellOutProof proof={outcomes.syntheticProofs.visualProofs.sellOut} />
        ) : null}
        {card.id === 'get-paid' ? (
          <GetPaidProof proof={outcomes.syntheticProofs.visualProofs.getPaid} />
        ) : null}
        {card.id === 'share-anywhere' ? (
          <ShareProof proof={outcomes.syntheticProofs.shareAnywhere} />
        ) : null}
      </div>
    </article>
  );
}

function DriveStreamsProof({
  proof,
}: Readonly<{
  proof: HomepageOutcomeCopy['syntheticProofs']['visualProofs']['driveStreams'];
}>) {
  return (
    <div className='homepage-outcome-release-stack'>
      <ReleaseProofCard label={proof.liveLabel} title={proof.title} />
      <ReleaseProofCard
        label={proof.presaveLabel}
        title={proof.title}
        artistName={proof.artistName}
      />
    </div>
  );
}

function ReleaseProofCard({
  label,
  title,
  artistName,
}: Readonly<{
  label: string;
  title: string;
  artistName?: string;
}>) {
  return (
    <div className='homepage-outcome-release-card'>
      <span className='homepage-outcome-proof-label'>{label}</span>
      <strong>{title}</strong>
      {artistName ? <span>{artistName}</span> : null}
    </div>
  );
}

function SellOutProof({
  proof,
}: Readonly<{
  proof: HomepageOutcomeCopy['syntheticProofs']['visualProofs']['sellOut'];
}>) {
  return (
    <div className='homepage-outcome-drawer'>
      <p className='homepage-outcome-drawer__title'>{proof.drawerTitle}</p>
      <div className='homepage-outcome-tour-list'>
        {proof.drawerRows.map(row => (
          <div key={row.id} className='homepage-outcome-tour-row'>
            <span>
              {row.month}
              <strong>{row.day}</strong>
            </span>
            <span>
              <strong>{row.venue}</strong>
              <small>{row.location}</small>
            </span>
            <small>{row.ctaLabel}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function GetPaidProof({
  proof,
}: Readonly<{
  proof: HomepageOutcomeCopy['syntheticProofs']['visualProofs']['getPaid'];
}>) {
  return (
    <div className='homepage-outcome-drawer'>
      <p className='homepage-outcome-drawer__title'>{proof.drawerTitle}</p>
      <p className='homepage-outcome-drawer__subtitle'>
        {proof.drawerSubtitle}
      </p>
      <div className='homepage-outcome-amount-list'>
        {proof.amountRows.map(row => (
          <div
            key={row.id}
            className={cn(
              'homepage-outcome-amount-row',
              row.featured && 'homepage-outcome-amount-row--featured'
            )}
          >
            <strong>{row.amount}</strong>
            <span>{row.currency}</span>
          </div>
        ))}
      </div>
      <span className='homepage-outcome-pay-cta'>{proof.ctaLabel}</span>
    </div>
  );
}

function ShareProof({
  proof,
}: Readonly<{
  proof: HomepageOutcomeCopy['syntheticProofs']['shareAnywhere'];
}>) {
  return (
    <div className='homepage-outcome-share-card'>
      <p>{proof.title}</p>
      <div className='homepage-outcome-qr' aria-hidden='true'>
        {QR_CELLS.map(cell => (
          <span
            key={cell.id}
            className={cn(cell.filled && 'homepage-outcome-qr__cell--filled')}
          />
        ))}
      </div>
      <strong>{proof.url}</strong>
      <span>{proof.subtitle}</span>
    </div>
  );
}

const QR_PATTERN = [
  '1110111',
  '1010101',
  '1110111',
  '0001000',
  '1111101',
  '1010001',
  '1110111',
] as const;

const QR_CELLS = QR_PATTERN.flatMap((row, rowIndex) =>
  row.split('').map((cell, cellIndex) => ({
    id: `r${rowIndex}c${cellIndex}`,
    filled: cell === '1',
  }))
);
