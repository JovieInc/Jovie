import { Container } from '@/components/site/Container';

export function NewSocialProofSection() {
  return (
    <section className='py-14 sm:py-16 bg-base'>
      <Container>
        <div className='mx-auto max-w-5xl'>
          <div className='grid gap-6 md:grid-cols-12 md:items-center'>
            <div className='md:col-span-7'>
              <h1 className='text-2xl sm:text-3xl font-semibold tracking-tight text-primary-token'>
                <span className='block'>Beautiful profiles</span>
                <span className='block'>Built to convert</span>
              </h1>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
