import Image from 'next/image';
import Link from 'next/link';

interface HeroLinearProps {
  readonly fullScreen?: boolean;
}

export function HeroLinear({ fullScreen = false }: Readonly<HeroLinearProps>) {
  return (
    <section
      className={
        fullScreen
          ? 'relative flex h-[calc(100dvh-var(--linear-header-height))] flex-col overflow-hidden'
          : 'relative flex min-h-[calc(100dvh-var(--linear-header-height))] flex-col overflow-hidden'
      }
      data-testid='homepage-shell'
      aria-labelledby='hero-heading'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0' />

      {/* Hero text — left aligned, same max-width + padding as header nav */}
      <div className='relative z-10 flex flex-1 flex-col justify-center pb-6 pt-10 md:pb-8 md:pt-12'>
        <div className='mx-auto w-full max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0'>
          <div className='hero-stagger'>
            <p className='homepage-section-eyebrow'>
              Built for independent artists
            </p>
            <h1
              id='hero-heading'
              className='marketing-h1-linear mt-4 text-primary-token leading-[1]'
              data-testid='hero-heading'
            >
              Drop More Music.
              <br />
              Crush Every Release.
            </h1>
            <p
              className='mt-5'
              style={{
                fontSize: '15px',
                fontWeight: 400,
                lineHeight: '24px',
                letterSpacing: '-0.011em',
                color: 'rgb(138, 143, 152)',
              }}
            >
              Smart links, release automation, and fan insight that keep every
              launch moving.
            </p>
            <div className='mt-6'>
              <Link
                href='/signup'
                className='inline-flex items-center justify-center rounded-[4px] text-[13px] font-[510] tracking-normal transition-colors duration-150 hover:brightness-110 focus-ring-themed'
                style={{
                  backgroundColor: 'rgb(230, 230, 230)',
                  color: 'rgb(8, 9, 10)',
                  padding: '0 16px',
                  height: '36px',
                }}
              >
                Get Started Free
              </Link>
            </div>
            <p className='mt-3 text-[11px] tracking-[0.01em] text-quaternary-token'>
              Free forever. No credit card required.
            </p>
          </div>
        </div>
      </div>

      {/* Product screenshot — same max-width as header, top-cropped */}
      <div className='relative z-10 mx-auto w-full max-w-[var(--linear-content-max)] px-5 sm:px-6 lg:px-0'>
        <div
          className='relative overflow-hidden'
          style={{ borderRadius: '6px', aspectRatio: '16 / 6' }}
        >
          <Image
            src='/product-screenshots/releases-dashboard-sidebar.png'
            alt='Jovie releases dashboard showing smart links, release management, and audience insights'
            fill
            sizes='(max-width: 768px) 100vw, (max-width: 1200px) 96vw, 1200px'
            priority
            quality={85}
            className='object-cover object-top'
          />
        </div>
      </div>
    </section>
  );
}
