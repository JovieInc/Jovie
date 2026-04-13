'use client';

import { cn } from '@/lib/utils';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import type { HomePrimarySubsceneId } from './home-scroll-scenes';

const GET_PAID_SCENES: readonly HomePrimarySubsceneId[] = [
  'tips-open',
  'tips-apple-pay',
];
const SAY_THANKS_SCENES: readonly HomePrimarySubsceneId[] = [
  'tips-thank-you',
  'tips-followup',
];

interface HomeTipConversionCardsProps {
  readonly activeSceneId: HomePrimarySubsceneId;
  readonly compact?: boolean;
}

export function HomeTipConversionCards({
  activeSceneId,
  compact = false,
}: Readonly<HomeTipConversionCardsProps>) {
  const getPaidActive = GET_PAID_SCENES.includes(activeSceneId);
  const sayThanksActive = SAY_THANKS_SCENES.includes(activeSceneId);

  return (
    <div
      className={cn(
        'homepage-tip-conversion-grid',
        compact && 'homepage-tip-conversion-grid-mobile'
      )}
      data-testid='homepage-tip-conversion-cards'
    >
      <article
        className='homepage-tip-conversion-card homepage-tip-conversion-card-primary'
        data-active={getPaidActive ? 'true' : 'false'}
      >
        <div className='homepage-tip-conversion-copy'>
          <h3 className='homepage-tip-conversion-title'>Get paid.</h3>
          <p className='homepage-tip-conversion-body'>
            Keep the payment in the profile, right next to the music.
          </p>
        </div>

        <div className='homepage-tip-conversion-phone-stage'>
          <HomeProfileShowcase
            stateId='tips-open'
            compact
            className='homepage-tip-conversion-phone'
          />
        </div>
      </article>

      <article
        className='homepage-tip-conversion-card homepage-tip-conversion-card-secondary'
        data-active={sayThanksActive ? 'true' : 'false'}
      >
        <div className='homepage-tip-conversion-copy'>
          <h3 className='homepage-tip-conversion-title'>Say thanks.</h3>
          <p className='homepage-tip-conversion-body'>
            Send the tipper back to the latest song while the moment is still
            warm.
          </p>
        </div>

        <div
          aria-hidden='true'
          className='homepage-tip-conversion-note'
          data-testid='homepage-tip-thanks-note'
        >
          <span className='homepage-tip-conversion-note-label'>Email</span>
          <p className='homepage-tip-conversion-note-title'>
            Thanks for the tip
          </p>
          <p className='homepage-tip-conversion-note-body'>
            Here&apos;s my latest song.
          </p>
        </div>
      </article>
    </div>
  );
}
