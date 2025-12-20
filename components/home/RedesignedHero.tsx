import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { ProductScreenshotPlaceholder } from './ProductScreenshotPlaceholder';

export function RedesignedHero() {
  return (
    <section className='relative py-16 sm:py-20 lg:py-24 bg-base'>
      <Container size='homepage' className='relative'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center'>
          {/* Left: Copy + CTA */}
          <div className='order-2 lg:order-1'>
            <h1 className='text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-primary-token leading-tight'>
              Stop sending fans to a page of links.
            </h1>

            <p className='mt-6 text-lg sm:text-xl text-secondary-token leading-relaxed max-w-xl'>
              An AI-powered link-in-bio that guides every fan to the action
              they're most likely to take — and gets better automatically.
            </p>

            <div className='mt-8 flex flex-col gap-4'>
              <Link
                href='/waitlist'
                className='inline-flex items-center justify-center h-12 px-6 rounded-lg bg-btn-primary text-btn-primary-foreground text-base font-medium hover:opacity-90 transition-opacity focus-ring-themed'
              >
                Request Early Access
              </Link>

              <p className='text-sm text-secondary-token'>
                Built for artists. Private waitlist.
              </p>
            </div>
          </div>

          {/* Right: Product visual */}
          <div className='order-1 lg:order-2'>
            <ProductScreenshotPlaceholder />
          </div>
        </div>
      </Container>
    </section>
  );
}

