'use client';

import { Check, Zap } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { SmartLinkProviderButton } from '@/components/release/SmartLinkProviderButton';
import { Container } from '@/components/site/Container';
import { PhoneFrame } from './PhoneFrame';

/* ------------------------------------------------------------------ */
/*  Mock release data — 3 Tim White releases                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Dashboard mockup                                                   */
/* ------------------------------------------------------------------ */

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
      <div className='flex items-center px-5 h-11 border-b border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)]'>
        <div className='flex gap-2'>
          <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
          <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
          <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
        </div>
        <div className='flex-1 text-center text-[11px] text-[var(--linear-text-tertiary)]'>
          Jovie — Releases
        </div>
        <div className='w-[52px]' />
      </div>

      {/* Table header */}
      <div
        className='grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-2.5'
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

      {/* Release rows */}
      {RELEASES.map((release, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={release.id}
            className='grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3 transition-colors duration-300'
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
            {/* Artwork */}
            <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md'>
              <Image
                src={release.artwork}
                alt={release.title}
                fill
                className='object-cover'
                sizes='40px'
              />
            </div>

            {/* Title + meta */}
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <p className='truncate text-[13px] font-medium text-[var(--linear-text-primary)]'>
                  {release.title}
                </p>
                {release.isNew && (
                  <span className='shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400'>
                    New
                  </span>
                )}
              </div>
              <p className='text-[11px] text-[var(--linear-text-tertiary)]'>
                {release.type} · {release.year}
              </p>
            </div>

            {/* Smart link pill */}
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
                className='font-mono text-[11px] transition-colors duration-300'
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

      {/* Footer row — hint that more releases exist */}
      <div className='flex items-center justify-center px-5 py-3'>
        <p className='text-[11px] text-[var(--linear-text-quaternary)]'>
          + every past &amp; future release, automatically
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Phone — smart link page for selected release                       */
/* ------------------------------------------------------------------ */

function ReleasePhone({
  release,
}: {
  readonly release: (typeof RELEASES)[number];
}) {
  return (
    <PhoneFrame>
      {/* URL bar */}
      <div
        className='mx-4 mt-10 mb-1 flex items-center justify-center rounded-full bg-[var(--linear-bg-surface-1)] px-3 py-1.5'
        style={{ border: '1px solid var(--linear-border-subtle)' }}
      >
        <span className='truncate text-[10px] text-[var(--linear-text-tertiary)]'>
          jov.ie/{release.slug}
        </span>
      </div>

      {/* Album artwork */}
      <div className='px-6 py-4'>
        <div
          className='relative w-full aspect-square overflow-hidden rounded-2xl'
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

      {/* Title */}
      <div className='px-6 pb-4 text-center'>
        <p className='text-[15px] font-semibold tracking-tight text-[var(--linear-text-primary)]'>
          {release.title}
        </p>
        <p className='mt-0.5 text-[12px] text-[var(--linear-text-tertiary)]'>
          Tim White
        </p>
      </div>

      {/* Streaming buttons */}
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

      {/* Powered by Jovie */}
      <div className='pb-3 pt-3 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-[var(--linear-text-quaternary)]'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export function ReleasesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRelease = RELEASES[activeIndex];

  return (
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      {/* Ambient glow */}
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
          {/* Section header */}
          <div className='flex flex-col gap-5 reveal-on-scroll'>
            <span className='inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium tracking-[-0.01em] text-[var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)]'>
              <Zap className='h-3 w-3' aria-hidden='true' />
              Automatic
            </span>

            <div className='grid md:grid-cols-2 md:items-start gap-5 md:gap-8'>
              <h2 className='marketing-h2-linear text-[var(--linear-text-primary)]'>
                Every release,
                <br />a perfect link.
              </h2>
              <p className='marketing-lead-linear text-[var(--linear-text-secondary)] max-w-md'>
                Connect Spotify once. Every song you&apos;ve ever released gets
                its own smart link across every platform — automatically. And
                every time you drop something new, your fans are notified.
                Without you lifting a finger.
              </p>
            </div>
          </div>

          {/* Release tabs */}
          <div
            className='mt-10 flex items-center gap-2 flex-wrap reveal-on-scroll'
            data-delay='60'
          >
            {RELEASES.map((release, i) => (
              <button
                key={release.id}
                type='button'
                onClick={() => setActiveIndex(i)}
                aria-pressed={i === activeIndex}
                className='flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-300'
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
                  className='text-[11px]'
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

          {/* Main content — dashboard + phone */}
          <div
            className='mt-8 flex flex-col lg:flex-row gap-6 lg:items-start reveal-on-scroll'
            data-delay='120'
          >
            {/* Dashboard mockup — takes most of the width */}
            <div className='flex-1 min-w-0'>
              <DashboardMockup activeIndex={activeIndex} />
            </div>

            {/* Phone — smart link preview */}
            <div className='hidden lg:block shrink-0'>
              <ReleasePhone release={activeRelease} />
            </div>
          </div>

          {/* Auto-email notification strip */}
          <div
            className='mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl px-6 py-4 reveal-on-scroll'
            style={{
              backgroundColor: 'var(--linear-bg-surface-0)',
              border: '1px solid var(--linear-border-subtle)',
            }}
            data-delay='160'
          >
            <div className='flex items-start sm:items-center gap-3'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--linear-bg-surface-2)]'>
                <Zap
                  className='h-4 w-4 text-[var(--linear-text-secondary)]'
                  aria-hidden='true'
                />
              </div>
              <div>
                <p className='text-[13px] font-medium text-[var(--linear-text-primary)]'>
                  Your fans are notified the moment it drops.
                </p>
                <p className='text-[12px] text-[var(--linear-text-tertiary)]'>
                  No templates. No scheduling. No Mailchimp.
                </p>
              </div>
            </div>

            {/* Delivered badge */}
            <div className='flex items-center gap-2 shrink-0'>
              <span className='flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20'>
                <Check
                  className='h-3 w-3 text-emerald-400'
                  aria-hidden='true'
                />
              </span>
              <span className='text-[13px] font-medium text-emerald-400/90'>
                4,218 fans notified
              </span>
              <span className='text-[12px] text-[var(--linear-text-quaternary)]'>
                · Zero emails written
              </span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
