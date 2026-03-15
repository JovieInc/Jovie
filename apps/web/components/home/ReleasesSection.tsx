'use client';

import { Check, Zap } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { SmartLinkProviderButton } from '@/components/release/SmartLinkProviderButton';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from './PhoneFrame';

const RELEASES = [
  {
    id: 'never-say-a-word',
    title: 'Never Say A Word',
    year: '2024',
    type: 'Single',
    artwork: 'https://i.scdn.co/image/ab67616d0000b273cbe401fd4a00b05b26a5233f',
    slug: 'tim/never-say-a-word',
    isNew: true,
  },
  {
    id: 'deep-end',
    title: 'The Deep End',
    year: '2017',
    type: 'Single',
    artwork: 'https://i.scdn.co/image/ab67616d0000b273164aac758a1deb79d33cc1b4',
    slug: 'tim/the-deep-end',
    isNew: false,
  },
  {
    id: 'take-me-over',
    title: 'Take Me Over',
    year: '2014',
    type: 'Single',
    artwork: 'https://i.scdn.co/image/ab67616d0000b2732c05c3b2fb08c606843e7d98',
    slug: 'tim/take-me-over',
    isNew: false,
  },
] as const;

const SMART_LINK_DSPS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon_music',
] as const;

const RELEASE_PROOF_POINTS = [
  'Catalog sync',
  'Smart links per release',
  'Fan notifications',
] as const;

function DashboardMockup({ activeIndex }: { readonly activeIndex: number }) {
  return (
    <div
      className='relative overflow-hidden rounded-xl md:rounded-2xl'
      style={{
        border: '1px solid var(--linear-border-subtle)',
        backgroundColor: 'var(--linear-bg-surface-0)',
        boxShadow: [
          '0 0 0 1px rgba(255,255,255,0.03)',
          '0 8px 40px rgba(0,0,0,0.35)',
          '0 24px 80px rgba(0,0,0,0.25)',
        ].join(', '),
      }}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent)',
        }}
      />

      <div className='flex h-11 items-center border-b border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] px-5'>
        <div className='flex gap-2'>
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#ED6A5E]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#F4BF4F]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#61C554]' />
        </div>
        <div className='flex-1 text-center text-xs text-[var(--linear-text-tertiary)]'>
          Jovie - Releases
        </div>
        <div className='w-[52px]' />
      </div>

      <div
        className='grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2.5'
        style={{ borderBottom: '1px solid var(--linear-border-subtle)' }}
      >
        <span className='text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--linear-text-quaternary)]'>
          Release
        </span>
        <span />
        <span className='text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--linear-text-quaternary)]'>
          Smart link
        </span>
      </div>

      {RELEASES.map((release, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={release.id}
            className='grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3 transition-colors duration-300'
            style={{
              backgroundColor: isActive
                ? 'rgba(255,255,255,0.035)'
                : 'transparent',
              borderBottom:
                i < RELEASES.length - 1
                  ? '1px solid var(--linear-border-subtle)'
                  : undefined,
            }}
          >
            <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md'>
              <Image
                src={release.artwork}
                alt={release.title}
                fill
                className='object-cover'
                sizes='40px'
              />
            </div>

            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <p className='truncate text-sm font-medium text-[var(--linear-text-primary)]'>
                  {release.title}
                </p>
                {release.isNew && (
                  <span className='shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400'>
                    New
                  </span>
                )}
              </div>
              <p className='text-xs text-[var(--linear-text-tertiary)]'>
                {release.type} - {release.year}
              </p>
            </div>

            <div
              className='flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all duration-300'
              style={{
                backgroundColor: isActive
                  ? 'rgba(255,255,255,0.07)'
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <svg
                width='11'
                height='11'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2.5'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='text-[var(--linear-text-tertiary)]'
                aria-hidden='true'
              >
                <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
                <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
              </svg>
              <span
                className='font-mono text-xs transition-colors duration-300'
                style={{
                  color: isActive
                    ? 'var(--linear-text-secondary)'
                    : 'var(--linear-text-tertiary)',
                }}
              >
                jov.ie/{release.slug}
              </span>
            </div>
          </div>
        );
      })}

      <div className='flex items-center justify-center px-5 py-3'>
        <p className='text-xs text-[var(--linear-text-quaternary)]'>
          + every past and future release, automatically
        </p>
      </div>
    </div>
  );
}

function ReleasePhone({
  release,
}: {
  readonly release: (typeof RELEASES)[number];
}) {
  return (
    <PhoneFrame>
      <div
        className='mx-4 mt-10 mb-1 flex items-center justify-center rounded-full bg-[var(--linear-bg-surface-1)] px-3 py-1.5'
        style={{ border: '1px solid var(--linear-border-subtle)' }}
      >
        <span className='truncate text-[10px] text-[var(--linear-text-tertiary)]'>
          jov.ie/{release.slug}
        </span>
      </div>

      <div className='px-6 py-4'>
        <div
          className='relative aspect-square w-full overflow-hidden rounded-2xl'
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <Image
            src={release.artwork}
            alt={release.title}
            fill
            className='object-cover'
            sizes='220px'
          />
        </div>
      </div>

      <div className='px-6 pb-4 text-center'>
        <p className='text-[15px] font-semibold tracking-tight text-[var(--linear-text-primary)]'>
          {release.title}
        </p>
        <p className='mt-0.5 text-xs text-[var(--linear-text-tertiary)]'>
          Tim White
        </p>
      </div>

      <div className='flex flex-col gap-2 px-5'>
        {SMART_LINK_DSPS.map(key => {
          const config = DSP_LOGO_CONFIG[key as keyof typeof DSP_LOGO_CONFIG];
          if (!config) return null;
          return (
            <SmartLinkProviderButton
              key={key}
              label={
                key === 'apple_music'
                  ? 'Apple Music'
                  : key === 'youtube_music'
                    ? 'YouTube Music'
                    : key === 'amazon_music'
                      ? 'Amazon Music'
                      : 'Spotify'
              }
              iconPath={config.iconPath}
              className='bg-[var(--linear-bg-surface-1)] ring-[color:var(--linear-border-subtle)] hover:bg-[var(--linear-bg-hover)]'
            />
          );
        })}
      </div>

      <div className='pb-3 pt-3 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-[var(--linear-text-quaternary)]'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

export function ReleasesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRelease = RELEASES[activeIndex];

  return (
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2'
        style={{
          width: '900px',
          height: '700px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(18% 0.02 265 / 0.12), transparent 65%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='reveal-on-scroll flex flex-col gap-5'>
            <span className='inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--linear-border-subtle)] px-3 py-1 text-xs font-medium tracking-[-0.01em] text-[var(--linear-text-tertiary)]'>
              <Zap className='h-3 w-3' aria-hidden='true' />
              Automatic
            </span>

            <div className='grid gap-5 md:grid-cols-2 md:items-start md:gap-8'>
              <h2 className='marketing-h2-linear text-[var(--linear-text-primary)]'>
                Every release gets a smart link and a built-in launch flow.
              </h2>
              <p className='max-w-md marketing-lead-linear text-[var(--linear-text-secondary)]'>
                Connect Spotify once. Jovie handles the rest — smart links,
                release updates, and fan notifications.
              </p>
            </div>
          </div>

          <div
            className='mt-8 flex flex-wrap gap-3 reveal-on-scroll'
            data-delay='40'
          >
            {RELEASE_PROOF_POINTS.map(point => (
              <span
                key={point}
                className='rounded-full border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] px-3 py-1.5 text-xs font-medium text-[var(--linear-text-secondary)]'
              >
                {point}
              </span>
            ))}
          </div>

          <div
            className='mt-10 flex flex-wrap items-center gap-2 reveal-on-scroll'
            data-delay='60'
          >
            {RELEASES.map((release, i) => (
              <button
                key={release.id}
                type='button'
                onClick={() => setActiveIndex(i)}
                className='flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300'
                style={{
                  backgroundColor:
                    i === activeIndex
                      ? 'rgba(255,255,255,0.08)'
                      : 'transparent',
                  border: `1px solid ${i === activeIndex ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                  color:
                    i === activeIndex
                      ? 'var(--linear-text-primary)'
                      : 'var(--linear-text-tertiary)',
                }}
              >
                {release.isNew && (
                  <span className='inline-block h-1.5 w-1.5 rounded-full bg-amber-400' />
                )}
                {release.title}
                <span
                  className='text-xs'
                  style={{
                    color:
                      i === activeIndex
                        ? 'var(--linear-text-tertiary)'
                        : 'var(--linear-text-quaternary)',
                  }}
                >
                  {release.year}
                </span>
              </button>
            ))}
          </div>

          <div
            className='mt-8 flex flex-col gap-6 reveal-on-scroll lg:flex-row lg:items-start'
            data-delay='120'
          >
            <div className='min-w-0 flex-1'>
              <DashboardMockup activeIndex={activeIndex} />
            </div>

            <div className='hidden shrink-0 lg:block'>
              <ReleasePhone release={activeRelease} />
            </div>
          </div>

          <div
            className='mt-8 flex flex-col justify-between gap-4 rounded-xl px-6 py-4 reveal-on-scroll sm:flex-row sm:items-center'
            style={{
              backgroundColor: 'var(--linear-bg-surface-0)',
              border: '1px solid var(--linear-border-subtle)',
            }}
            data-delay='160'
          >
            <div className='flex items-start gap-3 sm:items-center'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--linear-bg-surface-2)]'>
                <Zap
                  className='h-4 w-4 text-[var(--linear-text-secondary)]'
                  aria-hidden='true'
                />
              </div>
              <div>
                <p className='text-sm font-medium text-[var(--linear-text-primary)]'>
                  Launch without rebuilding assets every release.
                </p>
                <p className='text-xs text-[var(--linear-text-tertiary)]'>
                  Smart links, release pages, and fan notifications stay ready
                  for every drop.
                </p>
              </div>
            </div>

            <div className='flex shrink-0 items-center gap-2'>
              <span className='flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20'>
                <Check
                  className='h-3 w-3 text-emerald-400'
                  aria-hidden='true'
                />
              </span>
              <span className='text-sm font-medium text-emerald-400/90'>
                4,218 fans notified
              </span>
              <span className='text-xs text-[var(--linear-text-quaternary)]'>
                captured from your profile
              </span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
