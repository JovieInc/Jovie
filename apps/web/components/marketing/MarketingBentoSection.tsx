import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MarketingContainer } from './MarketingContainer';
import { MarketingSurfaceCard } from './MarketingSurfaceCard';
import './MarketingBentoSection.css';

export type MarketingBentoPreviewAspect = 'landscape' | 'portrait' | 'square';

export interface MarketingBentoCardAction {
  readonly href: string;
  readonly label: string;
}

interface MarketingBentoCardBase {
  readonly id: string;
  readonly title: string;
  readonly body: ReactNode;
  readonly action?: MarketingBentoCardAction;
}

type MarketingBentoCardPreview =
  | {
      readonly preview: ReactNode;
      readonly previewLabel: string;
      readonly previewAspect?: MarketingBentoPreviewAspect;
    }
  | {
      readonly preview?: never;
      readonly previewLabel?: never;
      readonly previewAspect?: never;
    };

export type MarketingBentoCard = MarketingBentoCardBase &
  MarketingBentoCardPreview;

export interface MarketingBentoSectionProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly titleId: string;
  readonly description: ReactNode;
  readonly featuredStart: MarketingBentoCard;
  readonly supportingTop: MarketingBentoCard;
  readonly supportingBottom: MarketingBentoCard;
  readonly featuredEnd: MarketingBentoCard;
  readonly className?: string;
  readonly testId?: string;
}

type MarketingBentoSlot =
  | 'featured-start'
  | 'supporting-top'
  | 'supporting-bottom'
  | 'featured-end';

const SLOT_CLASS_NAMES: Record<MarketingBentoSlot, string> = {
  'featured-start': 'xl:col-start-1 xl:row-span-2 xl:row-start-1',
  'supporting-top': 'xl:col-start-2 xl:row-start-1',
  'supporting-bottom': 'xl:col-start-2 xl:row-start-2',
  'featured-end': 'xl:col-start-3 xl:row-span-2 xl:row-start-1',
};

const PREVIEW_ASPECT_CLASS_NAMES: Record<MarketingBentoPreviewAspect, string> =
  {
    landscape: 'aspect-video',
    portrait: 'aspect-[4/5]',
    square: 'aspect-square',
  };

function MarketingBentoCardView({
  card,
  slot,
  sectionTitleId,
}: {
  readonly card: MarketingBentoCard;
  readonly slot: MarketingBentoSlot;
  readonly sectionTitleId: string;
}) {
  const featured = slot === 'featured-start' || slot === 'featured-end';
  const cardDomId = card.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const titleId = `${sectionTitleId}-${slot}-${cardDomId}-title`;
  const bodyId = `${sectionTitleId}-${slot}-${cardDomId}-body`;
  const previewAspect =
    card.previewAspect ?? (featured ? 'portrait' : 'landscape');

  return (
    <article
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid='marketing-bento-card'
      data-slot={slot}
      data-featured={featured ? 'true' : 'false'}
      data-has-preview={card.preview ? 'true' : 'false'}
      className={cn('min-w-0', SLOT_CLASS_NAMES[slot])}
    >
      <MarketingSurfaceCard
        variant='product-callout'
        glowTone='none'
        chrome='framed'
        className='h-full min-h-64'
        contentClassName='flex h-full flex-col'
      >
        {card.preview ? (
          <figure
            aria-label={card.previewLabel}
            data-preview-aspect={previewAspect}
            className={cn(
              'relative min-h-40 min-w-0 overflow-hidden border-b border-subtle bg-surface-0',
              PREVIEW_ASPECT_CLASS_NAMES[previewAspect],
              featured && 'flex-1'
            )}
          >
            {card.preview}
          </figure>
        ) : null}

        <div className='flex min-w-0 flex-1 flex-col p-6 sm:p-7'>
          <h3
            id={titleId}
            className={cn(
              'text-balance font-semibold tracking-tight text-primary-token',
              featured ? 'text-xl sm:text-2xl' : 'text-lg'
            )}
          >
            {card.title}
          </h3>
          <div
            id={bodyId}
            className='marketing-bento-section__secondary mt-3 max-w-prose text-sm leading-relaxed sm:text-base'
          >
            {card.body}
          </div>

          {card.action ? (
            <div className='mt-auto pt-6'>
              <Link
                href={card.action.href}
                className='public-action-secondary focus-ring-themed min-h-11 w-fit'
              >
                {card.action.label}
              </Link>
            </div>
          ) : null}
        </div>
      </MarketingSurfaceCard>
    </article>
  );
}

/**
 * Original Jovie marketing composition: two tall feature cards flank two
 * supporting cards. Named slots keep layout and reading order deterministic.
 */
export function MarketingBentoSection({
  eyebrow,
  title,
  titleId,
  description,
  featuredStart,
  supportingTop,
  supportingBottom,
  featuredEnd,
  className,
  testId = 'marketing-bento-section',
}: Readonly<MarketingBentoSectionProps>) {
  const cards = [
    ['featured-start', featuredStart],
    ['supporting-top', supportingTop],
    ['supporting-bottom', supportingBottom],
    ['featured-end', featuredEnd],
  ] as const satisfies readonly (readonly [
    MarketingBentoSlot,
    MarketingBentoCard,
  ])[];

  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      className={cn('section-spacing-linear bg-page', className)}
    >
      <MarketingContainer width='page'>
        <header className='mx-auto max-w-3xl text-center'>
          <p className='homepage-section-eyebrow'>{eyebrow}</p>
          <h2
            id={titleId}
            className='marketing-h2-linear mt-5 text-balance text-primary-token'
          >
            {title}
          </h2>
          <div className='marketing-bento-section__secondary mx-auto mt-5 max-w-2xl text-pretty text-mid leading-relaxed sm:text-base'>
            {description}
          </div>
        </header>

        <div
          data-testid='marketing-bento-grid'
          data-layout='three-column-two-row'
          className='mt-10 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2 xl:gap-4'
        >
          {cards.map(([slot, card]) => (
            <MarketingBentoCardView
              key={card.id}
              card={card}
              slot={slot}
              sectionTitleId={titleId}
            />
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
