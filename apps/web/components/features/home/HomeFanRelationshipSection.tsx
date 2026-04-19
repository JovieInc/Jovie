import { Container } from '@/components/site/Container';
import { HOME_RELATIONSHIP_SECTION_CONTENT } from './home-page-content';
import { MarketingRenderSurface } from './MarketingRenderSurface';

export function HomeFanRelationshipSection() {
  const [paymentCard, fanCard] = HOME_RELATIONSHIP_SECTION_CONTENT.cards;

  return (
    <section
      data-testid='homepage-fan-relationship'
      className='homepage-chapter'
      aria-labelledby='homepage-fan-relationship-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='homepage-chapter-copy'>
            <h2
              id='homepage-fan-relationship-heading'
              className='homepage-chapter-title'
            >
              {HOME_RELATIONSHIP_SECTION_CONTENT.title}
            </h2>
            <p className='homepage-chapter-body'>
              {HOME_RELATIONSHIP_SECTION_CONTENT.body}
            </p>
          </div>

          <div className='homepage-chapter-insight'>
            <article className='homepage-insight-card homepage-insight-card-lead'>
              <div className='homepage-insight-card-copy'>
                <h3 className='homepage-insight-card-title'>
                  {paymentCard.title}
                </h3>
                <p className='homepage-insight-card-body'>{paymentCard.body}</p>
              </div>
              <MarketingRenderSurface surfaceId='tips' />
            </article>

            <article className='homepage-insight-card homepage-insight-card-mini'>
              <div className='homepage-insight-card-copy'>
                <h3 className='homepage-insight-card-title'>{fanCard.title}</h3>
                <p className='homepage-insight-card-body'>{fanCard.body}</p>
              </div>
              <MarketingRenderSurface surfaceId='fans' />
            </article>
          </div>

          <p className='homepage-chapter-flow-line'>
            {HOME_RELATIONSHIP_SECTION_CONTENT.footnote}
          </p>
        </div>
      </Container>
    </section>
  );
}
