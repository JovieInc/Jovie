import { Container } from '@/components/site/Container';

export function NewSocialProofSection() {
  return (
    <section className='py-14 sm:py-16 bg-base'>
      <Container>
        <div className='mx-auto max-w-5xl'>
          <div className='grid gap-6 md:grid-cols-12 md:items-center'>
            <div className='md:col-span-7'>
              <p className='text-xs font-medium tracking-wide uppercase text-tertiary-token'>
                Built for conversion
              </p>

              <h2 className='mt-3 text-2xl sm:text-3xl font-medium tracking-tight text-primary-token'>
                A Jovie profile turns attention into real fan actions.
              </h2>

              <p className='mt-3 text-sm sm:text-base text-secondary-token leading-relaxed'>
                Fast load, clear next steps, and a layout built to keep fans
                moving—from tap to listen to follow.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
