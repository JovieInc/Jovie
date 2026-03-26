import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { ProductScreenshot } from './ProductScreenshot';

export function HeroProductShot() {
  return (
    <section className='relative overflow-hidden pb-0 pt-[5.5rem] md:pt-[6.1rem]'>
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
                <br />
                Find your sound faster.
              </h1>

              <p className='marketing-lead-linear mx-auto mt-5 max-w-[34rem] text-tertiary-token'>
                Every drop needs smart links, fan notifications, and playlist
                pitches. Jovie automates all of it — so you stay in the studio
                and ship more often.
              </p>

              <div className='mt-8 flex justify-center'>
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
                  Get Started
                </Link>
              </div>

              <p className='mt-4 text-[11px] tracking-[0.01em] text-quaternary-token'>
                Free to start. No credit card required.
              </p>
            </div>

            {/* Hero product screenshot */}
            <div
              className='reveal-on-scroll mx-auto mt-12 max-w-[1080px] md:mt-16'
              data-delay='80'
            >
              <ProductScreenshot
                src='/product-screenshots/releases-dashboard-full.png'
                alt='Jovie releases dashboard showing smart links, release status, and streaming data'
                width={2880}
                height={1800}
                title='Jovie — Releases'
                priority
                skipCheck
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
