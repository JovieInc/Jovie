'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Suspense } from 'react';

import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Container } from '@/components/site/Container';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import { DSP_CONFIGS } from '@/lib/dsp';

/* ------------------------------------------------------------------ */
/*  Lazy-load the real ReleaseTable (heavy component, below-fold)       */
/* ------------------------------------------------------------------ */

const DemoRealReleasesPanel = dynamic(
  () =>
    import('@/features/demo/DemoRealReleasesPanel').then(
      m => m.DemoRealReleasesPanel
    ),
  { ssr: false }
);

/* ------------------------------------------------------------------ */
/*  DSP platforms shown on the floating smart link card                  */
/* ------------------------------------------------------------------ */

const SMART_LINK_DSPS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon_music',
] as const;

/* ------------------------------------------------------------------ */
/*  Skeleton loader — shown while real table loads                       */
/* ------------------------------------------------------------------ */

function ReleasesTableSkeleton() {
  return (
    <div className='bg-surface-0 p-5'>
      {(['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'] as const).map((id, i) => (
        <div
          key={id}
          className='flex items-center gap-4 py-3'
          style={{
            borderBottom:
              i < 5 ? '1px solid var(--linear-border-subtle)' : undefined,
          }}
        >
          <div className='h-10 w-10 shrink-0 rounded-md bg-surface-2 animate-pulse' />
          <div className='flex-1 space-y-2'>
            <div className='h-3 w-32 rounded bg-surface-2 animate-pulse' />
            <div className='h-2.5 w-20 rounded bg-surface-2 animate-pulse' />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section                                                             */
/* ------------------------------------------------------------------ */

export function AutomaticReleaseSmartlinksSection() {
  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      {/* Ambient glow — large, soft, centered behind mockup */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/3'
        style={{
          width: '900px',
          height: '700px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(18% 0.015 260 / 0.12), transparent 65%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          {/* Two-column header */}
          <div className='grid md:grid-cols-2 md:items-start section-gap-linear'>
            <h2 className='max-w-md marketing-h2-linear text-primary-token'>
              New release?
              <br />
              Already live.
            </h2>
            <div className='max-w-lg'>
              <p className='marketing-lead-linear text-secondary-token'>
                Connect Spotify once. Every new release gets a smart link across
                every platform — automatically.
              </p>
              <span className='mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-tertiary-token border border-subtle'>
                Zero manual work
              </span>
            </div>
          </div>

          {/* Product Mockup — side-by-side layout */}
          <div className='mt-16 md:mt-20 mx-auto w-full'>
            <div className='flex flex-col md:flex-row gap-6 md:items-start'>
              {/* Dashboard window — real ReleaseTable */}
              <div
                className='relative overflow-hidden rounded-t-xl md:rounded-t-2xl rounded-b-none flex-1 min-w-0'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-0)',
                  boxShadow: [
                    'var(--linear-panel-ring) 0px 0px 0px 1px inset',
                    '0 8px 40px rgba(0,0,0,0.35)',
                    '0 24px 80px rgba(0,0,0,0.25)',
                  ].join(', '),
                }}
              >
                {/* Shine border */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 rounded-t-xl md:rounded-t-2xl rounded-b-none z-10'
                  style={{
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                />

                {/* Top edge highlight */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 top-0 h-px z-10'
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent)',
                  }}
                />

                {/* Mac window chrome */}
                <div className='flex items-center px-5 h-12 border-b border-subtle bg-surface-1'>
                  <div className='flex gap-2'>
                    <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
                    <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
                  </div>
                  <div className='flex-1 text-center text-[var(--linear-caption-size)] text-tertiary-token'>
                    Jovie Dashboard
                  </div>
                  <div className='w-[52px]' />
                </div>

                {/* Real ReleaseTable — capped height with fade */}
                <div className='relative h-[420px] overflow-hidden'>
                  <Suspense fallback={<ReleasesTableSkeleton />}>
                    <DemoRealReleasesPanel />
                  </Suspense>

                  {/* Bottom gradient fade */}
                  <div
                    className='pointer-events-none absolute inset-x-0 bottom-0 h-32 z-[2]'
                    style={{
                      background:
                        'linear-gradient(to top, var(--linear-bg-surface-0), transparent)',
                    }}
                  />
                </div>
              </div>

              {/* Smart Link Card — beside the table */}
              <div
                className='hidden md:flex flex-col w-[272px] shrink-0 overflow-hidden rounded-t-2xl rounded-b-none'
                style={{
                  backgroundColor: 'var(--linear-bg-surface-0)',
                  color: 'var(--linear-text-primary)',
                  boxShadow: [
                    'var(--linear-panel-ring) 0px 0px 0px 1px inset',
                    '0 8px 40px rgba(0,0,0,0.35)',
                    '0 24px 80px rgba(0,0,0,0.25)',
                  ].join(', '),
                }}
              >
                {/* Shine border */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 rounded-t-2xl rounded-b-none z-10'
                  style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                />

                {/* Top edge highlight */}
                <div
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-x-0 top-0 h-px z-10'
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.10) 70%, transparent)',
                  }}
                />

                <div className='relative px-6 pt-8 pb-5 flex flex-col items-center'>
                  {/* Album artwork */}
                  <div
                    className='relative w-full aspect-square overflow-hidden rounded-lg'
                    style={{
                      border: '1px solid var(--linear-border-subtle)',
                      boxShadow:
                        '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
                    }}
                  >
                    <Image
                      src='https://i.scdn.co/image/ab67616d0000b2739f0aacc7a97241bea42f7815'
                      alt='The Deep End — Tim White'
                      fill
                      className='object-cover'
                      sizes='272px'
                    />
                  </div>

                  {/* Release info */}
                  <div className='mt-4 w-full text-center'>
                    <h3 className='text-lg font-[var(--linear-font-weight-semibold)] leading-snug tracking-tight'>
                      The Deep End
                    </h3>
                    <p className='mt-1 text-sm text-secondary-token'>
                      Tim White
                    </p>
                    <p className='mt-0.5 text-2xs tracking-wide text-tertiary-token'>
                      Feb 2017
                    </p>
                  </div>

                  {/* Platform buttons */}
                  <div className='mt-5 w-full space-y-2'>
                    {SMART_LINK_DSPS.map(key => {
                      const config = DSP_CONFIGS[key];
                      if (!config) return null;
                      return (
                        <SmartLinkProviderButton
                          key={key}
                          label={config.name}
                          iconPath={
                            DSP_LOGO_CONFIG[key as keyof typeof DSP_LOGO_CONFIG]
                              ?.iconPath
                          }
                          className='bg-surface-1 ring-[color:var(--linear-border-subtle)] hover:bg-hover'
                        />
                      );
                    })}
                  </div>

                  {/* Powered by Jovie */}
                  <div className='mt-3 pt-3 text-center'>
                    <span className='inline-flex items-center gap-1 text-2xs uppercase tracking-widest text-tertiary-token'>
                      <span>Powered by</span>
                      <span className='font-[var(--linear-font-weight-semibold)]'>
                        Jovie
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
