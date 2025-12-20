import { Container } from '@/components/site/Container';

export function InsightSection() {
  return (
    <section className='py-16 sm:py-20 lg:py-24 bg-base border-t border-subtle'>
      <Container size='homepage'>
        <div className='max-w-3xl mx-auto text-center space-y-6'>
          <h2 className='text-3xl sm:text-4xl font-medium tracking-tight text-primary-token'>
            Fans don't want options. They want direction.
          </h2>

          <div className='space-y-4 text-base sm:text-lg text-secondary-token leading-relaxed'>
            <p>
              Instead of showing every link at once, this page shows one clear
              action — based on the fan and the moment.
            </p>

            <p>New fans are guided to subscribe.</p>

            <p>Returning fans are guided to listen.</p>

            <p>
              Every interaction feeds the system so the page continuously
              optimizes itself.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
