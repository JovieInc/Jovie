import { Container } from '@/components/site/Container';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import { HOME_SPEC_CARDS, HOME_SPEC_FACTS } from './home-scroll-scenes';

function OpinionatedDesignCard() {
  const opinionatedCard = HOME_SPEC_CARDS.find(
    card => card.id === 'opinionated-design'
  );

  if (!opinionatedCard) {
    return null;
  }

  return (
    <article
      className='homepage-opinionated-card'
      data-testid='homepage-opinionated-design-card'
    >
      <div className='homepage-opinionated-copy'>
        <h3 className='homepage-opinionated-title'>{opinionatedCard.title}</h3>
        <p className='homepage-opinionated-body'>{opinionatedCard.body}</p>
      </div>

      <div className='homepage-opinionated-phone-stage'>
        <HomeProfileShowcase stateId='streams-release-day' />
      </div>
    </article>
  );
}

function SpecSupportCard({
  id,
  title,
  body,
}: Readonly<(typeof HOME_SPEC_CARDS)[number]>) {
  return (
    <article className='homepage-spec-support-card' data-card-id={id}>
      <h3 className='homepage-spec-support-title'>{title}</h3>
      <p className='homepage-spec-support-body'>{body}</p>
    </article>
  );
}

export function HomeSpecChapter() {
  const supportCards = HOME_SPEC_CARDS.filter(
    card => card.id !== 'opinionated-design'
  );

  return (
    <section
      data-testid='homepage-spec-section'
      className='border-t border-subtle bg-page py-24 sm:py-28 xl:py-36'
      aria-labelledby='homepage-spec-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='max-w-[40rem]'>
            <h2
              id='homepage-spec-heading'
              className='marketing-h2-linear text-primary-token'
            >
              Opinionated where it counts.
            </h2>
            <p className='mt-4 max-w-[36rem] text-[15px] leading-[1.72] text-secondary-token sm:text-[16px]'>
              One profile that switches automatically, captures fans, keeps
              support connected, and stays conversion-first by default.
            </p>
          </div>

          <div className='homepage-spec-layout mt-12'>
            <OpinionatedDesignCard />

            <div className='homepage-spec-support-grid'>
              {supportCards.map(card => (
                <SpecSupportCard key={card.id} {...card} />
              ))}
            </div>

            <div
              className='homepage-spec-facts'
              data-testid='homepage-spec-facts'
            >
              {HOME_SPEC_FACTS.map(fact => (
                <div key={fact.id} className='homepage-spec-fact'>
                  {fact.value}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
