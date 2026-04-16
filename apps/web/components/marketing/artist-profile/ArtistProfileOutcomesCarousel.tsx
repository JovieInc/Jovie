import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfilePlaceholderShot } from './ArtistProfilePlaceholderShot';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOutcomesCarouselProps {
  readonly outcomes: ArtistProfileLandingCopy['outcomes'];
}

function outcomeVariant(
  id: ArtistProfileLandingCopy['outcomes']['cards'][number]['id']
) {
  switch (id) {
    case 'drive-streams':
      return 'outcome-listen';
    case 'fill-the-room':
      return 'outcome-local';
    case 'get-paid':
      return 'outcome-support';
    case 'capture-fans':
      return 'outcome-capture';
    case 'share-anywhere':
      return 'outcome-link';
  }
}

export function ArtistProfileOutcomesCarousel({
  outcomes,
}: Readonly<ArtistProfileOutcomesCarouselProps>) {
  return (
    <ArtistProfileSectionShell className='bg-white/[0.01]' width='landing'>
      <div>
        <h2 className='marketing-h2-linear max-w-[14ch] text-primary-token'>
          {outcomes.headline}
        </h2>
        <p className='mt-5 max-w-[32rem] text-[15px] leading-[1.7] text-secondary-token'>
          {outcomes.body}
        </p>
      </div>

      <div className='mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3'>
        {outcomes.cards.map((card, index) => (
          <article
            key={card.id}
            className='overflow-hidden rounded-[2rem] bg-white/[0.035]'
          >
            <div className='grid min-h-[430px] grid-rows-[1fr_auto] p-7'>
              <div className='overflow-hidden rounded-[1.5rem] bg-black/28'>
                <ArtistProfilePlaceholderShot
                  variant={outcomeVariant(card.id)}
                  className='min-h-[260px]'
                />
              </div>
              <div className='mt-7 flex items-end justify-between gap-8'>
                <div>
                  <p className='font-mono text-[12px] tracking-[-0.02em] text-tertiary-token'>
                    0{index + 1}
                  </p>
                  <h3 className='mt-2 text-[28px] font-semibold leading-[1] tracking-[-0.05em] text-primary-token'>
                    {card.title}
                  </h3>
                </div>
                <p className='max-w-[18rem] text-[14px] leading-[1.55] text-secondary-token'>
                  {card.description}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}
