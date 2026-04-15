import { Container } from '@/components/site/Container';
import { HOME_ENGAGE_CONTENT } from './home-page-content';
import { MarketingRenderSurface } from './MarketingRenderSurface';

export function HomeEngageBentoSection() {
  return (
    <section
      data-testid='homepage-engage-bento'
      className='homepage-chapter'
      aria-labelledby='engage-bento-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <h2 id='engage-bento-heading' className='homepage-chapter-title'>
            {HOME_ENGAGE_CONTENT.title}
          </h2>
          <p className='homepage-chapter-body mt-4 max-w-[42rem]'>
            {HOME_ENGAGE_CONTENT.body}
          </p>
        </div>
      </Container>

      <div className='homepage-bento-track'>
        {HOME_ENGAGE_CONTENT.cards.map(card => (
          <article key={card.id} className='homepage-bento-card'>
            <div className='homepage-bento-card-visual'>
              <MarketingRenderSurface surfaceId={card.surfaceId} />
            </div>
            <div className='homepage-bento-card-copy'>
              <h3 className='homepage-bento-card-title'>{card.title}</h3>
              <p className='homepage-bento-card-body'>{card.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
