import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { ProductScreenshot } from './ProductScreenshot';

export function HeroProductShot() {
  return (
    <section className='relative overflow-hidden pb-0 pt-[5.5rem] md:pt-[6.5rem]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[1120px]'>
          <div className='hero-stagger'>
            <div className='mx-auto max-w-[48rem] text-center'>
              <p className='homepage-section-eyebrow'>
                The operating system for music releases
              </p>

              <h1 className='marketing-h1-linear mt-5 text-primary-token'>
                Release more music.
              </h1>

              <p className='marketing-lead-linear mx-auto mt-5 max-w-[32rem] text-tertiary-token'>
                Smart links, fan notifications, and release automation — so you
                stay in the studio and ship more often.
              </p>

              <div className='mt-8 flex items-center justify-center gap-4'>
                <Link
                  href='/signup'
                  className='btn-linear-signup focus-ring-themed'
                  style={{
                    height: '2.75rem',
                    padding: '0 1.75rem',
                    fontSize: '15px',
                    borderRadius: '6px',
                  }}
                >
                  Get Started — Free
                </Link>
              </div>

              <p className='mt-4 text-[11px] tracking-[0.01em] text-quaternary-token'>
                No credit card required
              </p>
            </div>

            {/* Hero product screenshot with bottom fade */}
            <div className='relative mx-auto mt-14 max-w-[1080px] md:mt-20'>
              <ProductScreenshot
                src='/product-screenshots/releases-dashboard-full.png'
                alt='Jovie releases dashboard showing smart links, release status, and streaming data'
                width={2880}
                height={1800}
                priority
                skipCheck
              />
              {/* Bottom gradient fade — screenshot dissolves into bg */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-0 bottom-0 z-20 h-48'
                style={{
                  background:
                    'linear-gradient(to top, var(--color-bg-base) 0%, transparent 100%)',
                }}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
