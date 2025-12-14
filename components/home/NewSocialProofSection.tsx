import { Container } from '@/components/site/Container';

export function NewSocialProofSection() {
  return (
    <section className='py-14 sm:py-16 bg-base'>
      <Container>
        <div className='mx-auto max-w-5xl'>
          <div className='grid gap-6 md:grid-cols-12 md:items-center'>
            <div className='md:col-span-7'>
              <p className='text-xs font-medium tracking-wide uppercase text-tertiary-token'>
                Proven growth
              </p>

              <h2 className='mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-primary-token'>
                We’ve driven{' '}
                <span className='text-accent-token'>90 million streams</span>.
              </h2>

              <p className='mt-3 text-sm sm:text-base text-secondary-token leading-relaxed'>
                That experience is built into every Jovie profile—designed to
                turn attention into listeners.
              </p>
            </div>

            <div className='md:col-span-5'>
              <div className='rounded-2xl border border-subtle bg-surface-0 p-6 sm:p-7'>
                <p className='text-xs font-medium text-tertiary-token'>
                  Social proof
                </p>

                <div className='mt-3 flex items-baseline gap-2'>
                  <span className='text-3xl sm:text-4xl font-semibold tracking-tight text-primary-token'>
                    90M
                  </span>
                  <span className='text-sm text-secondary-token'>
                    streams driven
                  </span>
                </div>

                <p className='mt-2 text-xs text-tertiary-token'>
                  From real music growth work.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
