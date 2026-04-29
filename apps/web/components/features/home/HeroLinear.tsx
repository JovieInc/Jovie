import Image from 'next/image';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

const HERO_LINEAR_IMAGE = getMarketingExportImage(
  'dashboard-releases-sidebar-desktop'
);

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
            <p className='mt-5 text-base font-normal leading-6 tracking-[-0.011em] text-tertiary-token'>
              Smart links, release automation, and fan insight that keep every
              launch moving.
            </p>
            <div className='mt-6'>
              <Link
                href={APP_ROUTES.SIGNUP}
                className='public-action-primary focus-ring-themed'
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
            src={HERO_LINEAR_IMAGE.publicUrl}
            alt='Jovie releases dashboard showing smart links, release management, and audience insights'
            fill
            sizes='(max-width: 768px) 100vw, (max-width: 1200px) 96vw, 1200px'
            priority
            fetchPriority='high'
            quality={85}
            className='object-cover object-top'
          />
        </div>
      </div>
    </section>
  );
}
