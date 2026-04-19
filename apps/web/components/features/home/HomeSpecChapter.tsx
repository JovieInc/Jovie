import { Container } from '@/components/site/Container';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import { HOME_PHILOSOPHY_CONTENT } from './home-page-content';

const CARD_VISUALS: Record<
  string,
  { stateId: string; presentation: string } | null
> = {
  opinionated: { stateId: 'streams-release-day', presentation: 'beauty-shot' },
  'zero-setup': { stateId: 'streams-presave', presentation: 'beauty-shot' },
  speed: { stateId: 'catalog', presentation: 'beauty-shot' },
  'fan-relationship': {
    stateId: 'fans-confirmed',
    presentation: 'beauty-shot',
  },
};

const ALL_CARDS = [
  {
    id: 'opinionated',
    title: `${HOME_PHILOSOPHY_CONTENT.leadTitle} By design.`,
    body: HOME_PHILOSOPHY_CONTENT.leadBody,
  },
  ...HOME_PHILOSOPHY_CONTENT.cards.map(c => ({
    id: c.id,
    title: c.title,
    body: c.body,
  })),
];

export function HomeSpecChapter() {
  return (
    <section
      data-testid='homepage-spec-section'
      className='homepage-philosophy-section'
      aria-labelledby='homepage-spec-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <h2
            id='homepage-spec-heading'
            className='homepage-philosophy-heading'
          >
            {HOME_PHILOSOPHY_CONTENT.sectionTitle}
          </h2>
        </div>
      </Container>

      <div className='homepage-philosophy-track'>
        {ALL_CARDS.map(card => {
          const visual = CARD_VISUALS[card.id];
          return (
            <article
              key={card.id}
              className='homepage-philosophy-card'
              data-card-id={card.id}
            >
              <div className='homepage-philosophy-card-copy'>
                <h3 className='homepage-philosophy-card-title'>{card.title}</h3>
                <p className='homepage-philosophy-card-body'>{card.body}</p>
              </div>
              {visual && (
                <div className='homepage-philosophy-card-visual'>
                  <HomeProfileShowcase
                    stateId={visual.stateId as 'catalog'}
                    presentation={visual.presentation as 'beauty-shot'}
                    overlayMode='hidden'
                    className='homepage-philosophy-card-showcase'
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
