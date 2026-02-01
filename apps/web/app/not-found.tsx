import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';

export default function NotFound() {
  return (
    <div className='min-h-screen bg-base'>
      <Header />

      <main>
        <Container className='flex min-h-[calc(100vh-8rem)] items-center justify-center'>
          <div className='w-full max-w-xl mx-auto text-center px-4 py-16 animate-fade-in-up'>
            <div className='mb-10 relative'>
              <div className='absolute -inset-1 rounded-full bg-gradient-to-r from-surface-2/50 via-surface-3/30 to-surface-2/50 blur-2xl' />
              <div className='relative inline-flex items-baseline gap-3'>
                <span className='text-6xl md:text-8xl font-semibold tracking-tight text-primary-token'>
                  404
                </span>
                <span className='hidden md:inline text-xs font-medium tracking-[0.3em] uppercase text-tertiary-token'>
                  Not found
                </span>
              </div>
            </div>

            <h1 className='text-2xl md:text-3xl font-medium text-primary-token tracking-tight mb-3'>
              Page Not Found
            </h1>
            <p className='text-base text-secondary-token leading-relaxed mb-8'>
              The link you followed may be broken, or the page may have moved.
            </p>

            <div className='flex items-center justify-center gap-3'>
              <Link
                href='/'
                className='inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 bg-btn-primary text-btn-primary-foreground hover:opacity-90 focus-visible:ring-color-accent/50 px-6 py-3 text-base'
              >
                Return Home
              </Link>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
