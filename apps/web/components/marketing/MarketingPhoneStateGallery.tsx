import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { MarketingPhoneImage } from '@/components/marketing/MarketingPhoneImage';
import { cn } from '@/lib/utils';
import './MarketingProductStates.css';

export interface MarketingPhoneState {
  readonly id: string;
  /** Screenshot-registry scenario (lib/screenshots/registry.ts). */
  readonly scenarioId: string;
  readonly alt: string;
  readonly title: string;
  readonly body: string;
}

export interface MarketingPhoneStateGalleryProps {
  /** One real product state per phone. Two to four states. */
  readonly states: readonly MarketingPhoneState[];
  /** Accessible name for the gallery region (it scrolls on phones). */
  readonly label: string;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Canonical product-gallery body: real registry captures of one mobile
 * profile, one state per phone, each with a short caption. Phones sit in a
 * grid on wide screens and a scroll-snap rail on phones; the page itself
 * never scrolls sideways.
 */
export function MarketingPhoneStateGallery({
  states,
  label,
  className,
  testId = 'marketing-phone-state-gallery',
}: Readonly<MarketingPhoneStateGalleryProps>) {
  return (
    <section
      className={cn('marketing-phone-gallery', className)}
      data-testid={testId}
      data-count={states.length}
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the rail scrolls on phones, so keyboard users need a focusable region to scroll it (axe scrollable-region-focusable).
      tabIndex={0}
    >
      <ul className='marketing-phone-gallery__list'>
        {states.map(state => (
          <li key={state.id} className='marketing-phone-gallery__item'>
            <figure className='marketing-phone-gallery__figure'>
              <ArtistProfilePhoneFrame className='marketing-phone-gallery__phone'>
                <MarketingPhoneImage
                  scenarioId={state.scenarioId}
                  altOverride={state.alt}
                  fill
                  sizes='(min-width: 1024px) 21.25rem, (min-width: 768px) 30vw, 72vw'
                  className='object-cover object-top'
                />
              </ArtistProfilePhoneFrame>
              <figcaption className='marketing-phone-gallery__caption'>
                <span className='marketing-phone-gallery__title'>
                  {state.title}
                </span>
                <span className='marketing-phone-gallery__body'>
                  {state.body}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
