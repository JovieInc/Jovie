import Link from 'next/link';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section className='py-16 sm:py-20 lg:py-24 bg-base'>
      <Container size='homepage'>
        <div className='max-w-2xl mx-auto text-center space-y-8'>
          <h2 className='text-3xl sm:text-4xl font-medium tracking-tight text-primary-token'>
            Turn casual listeners into real fans.
          </h2>

          <div className='flex flex-col items-center gap-4'>
            <Link
              href='/waitlist'
              className='inline-flex items-center justify-center h-12 px-6 rounded-lg bg-btn-primary text-btn-primary-foreground text-base font-medium hover:opacity-90 transition-opacity focus-ring-themed'
            >
              Request Early Access
            </Link>

            <p className='text-sm text-secondary-token'>Waitlist only.</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
