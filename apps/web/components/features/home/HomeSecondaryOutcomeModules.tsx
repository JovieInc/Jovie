import { Container } from '@/components/site/Container';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import { HOME_SECONDARY_MODULES } from './home-scroll-scenes';

function OutcomeModule({
  id,
  title,
  body,
  showcaseState,
}: Readonly<(typeof HOME_SECONDARY_MODULES)[number]>) {
  return (
    <article className='homepage-outcome-module' data-module={id}>
      <div className='homepage-outcome-copy'>
        <h3 className='homepage-outcome-title'>{title}</h3>
        <p className='homepage-outcome-body'>{body}</p>
      </div>
      <div className='homepage-outcome-phone-shell'>
        <HomeProfileShowcase stateId={showcaseState} compact />
      </div>
    </article>
  );
}

export function HomeSecondaryOutcomeModules() {
  return (
    <section
      data-testid='homepage-secondary-outcomes'
      className='border-t border-subtle bg-page py-24 sm:py-28 xl:py-36'
      aria-labelledby='homepage-secondary-outcomes-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='max-w-[34rem]'>
            <h2
              id='homepage-secondary-outcomes-heading'
              className='marketing-h2-linear text-primary-token'
            >
              Keep every door open.
            </h2>
          </div>

          <div className='homepage-outcome-grid mt-12'>
            {HOME_SECONDARY_MODULES.map(module => (
              <OutcomeModule key={module.id} {...module} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
