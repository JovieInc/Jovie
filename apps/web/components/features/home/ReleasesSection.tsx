'use client';

import { BellRing, CheckCheck, Mail, Zap } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { Container } from '@/components/site/Container';
import { DashboardMockup } from './DashboardMockup';
import { PhoneFrame } from './PhoneFrame';
import { ReleasePhoneContent } from './ReleasePhoneContent';
import { RELEASES } from './releases-data';

const RELEASE_PROOF_POINTS = [
  'Release page generated',
  'Auto-matched across DSPs',
  'Release notifications on paid plans',
] as const;

function ReleasePhone({
  release,
}: {
  readonly release: (typeof RELEASES)[number];
}) {
  return (
    <PhoneFrame>
      <ReleasePhoneContent release={release} />
      <div className='pb-3 pt-3 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-quaternary-token'>
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
    <section
      id='release-proof'
      className='section-spacing-linear relative overflow-hidden bg-page'
    >
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
        <div className='homepage-section-shell'>
          <div className='homepage-section-intro reveal-on-scroll'>
            <div>
              <span className='homepage-section-eyebrow'>
                <Zap className='h-3 w-3' aria-hidden='true' />
                Release automation
              </span>
              <h2 className='mt-4 max-w-[10ch] marketing-h2-linear text-primary-token'>
                Release day, automated.
              </h2>
            </div>
            <p className='homepage-section-copy marketing-lead-linear text-secondary-token'>
              The moment a song drops, Jovie spins up the release page, matches
              every major platform, and starts the launch for you.
            </p>
          </div>

          <div
            className='homepage-section-stack reveal-on-scroll'
            data-delay='40'
          >
            <div className='-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0'>
              <div className='flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap'>
                {RELEASE_PROOF_POINTS.map(point => (
                  <span
                    key={point}
                    className='rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-token'
                  >
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            className='mt-4 flex flex-wrap items-center gap-2 reveal-on-scroll sm:mt-5'
            data-delay='60'
          >
            {RELEASES.map((release, index) => (
              <button
                key={release.id}
                type='button'
                onClick={() => setActiveIndex(index)}
                className='flex items-center gap-2 rounded-full px-3.5 py-[0.44rem] text-[13px] font-medium transition-all duration-300 sm:px-4 sm:py-2 sm:text-sm'
                style={{
                  backgroundColor:
                    index === activeIndex
                      ? 'rgba(255,255,255,0.08)'
                      : 'transparent',
                  border: `1px solid ${index === activeIndex ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                  color:
                    index === activeIndex
                      ? 'var(--linear-text-primary)'
                      : 'var(--linear-text-tertiary)',
                }}
              >
                {release.isNew && (
                  <span className='inline-block h-1.5 w-1.5 rounded-full bg-amber-400' />
                )}
                {release.title}
                <span
                  className='text-[11px] sm:text-xs'
                  style={{
                    color:
                      index === activeIndex
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
            className='homepage-surface-card reveal-on-scroll relative mt-5 overflow-hidden rounded-[1rem] p-3.5 sm:mt-6 sm:p-4 md:p-5'
            data-delay='120'
          >
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-0 top-0 h-px'
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.14) 32%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.14) 68%, transparent)',
              }}
            />

            <div className='flex flex-wrap items-center justify-between gap-3 rounded-[0.9rem] border border-subtle bg-surface-1 px-3.5 py-3 sm:px-4'>
              <div>
                <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                  Release event
                </p>
                <p className='mt-1 text-sm font-medium text-primary-token'>
                  {activeRelease.title} is live across your catalog.
                </p>
              </div>

              <div className='inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-3 py-1.5 text-sm font-medium text-emerald-300'>
                <BellRing className='h-4 w-4' />
                4,218 fans notified
              </div>
            </div>

            <div className='mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start'>
              <div className='space-y-3'>
                <div className='max-w-[42rem]'>
                  <DashboardMockup activeIndex={activeIndex} />
                </div>

                <div className='flex items-center gap-3 rounded-[0.9rem] border border-subtle bg-surface-1 px-4 py-3 lg:hidden'>
                  <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2'>
                    <Image
                      src={activeRelease.artwork}
                      alt={activeRelease.title}
                      fill
                      sizes='48px'
                      className='object-cover'
                    />
                  </div>
                  <div className='min-w-0'>
                    <p className='text-sm font-medium text-primary-token'>
                      Smart link live for {activeRelease.title}
                    </p>
                    <p className='text-sm text-secondary-token'>
                      Auto-matched across Spotify, Apple Music, and YouTube
                      Music.
                    </p>
                  </div>
                </div>
              </div>

              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-1'>
                <div className='rounded-[0.9rem] border border-subtle bg-surface-1 p-4'>
                  <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                    Paid release notifications
                  </p>
                  <p className='mt-2 text-[1.6rem] font-semibold tracking-tight text-primary-token'>
                    4,218
                  </p>
                  <p className='text-sm font-medium text-secondary-token'>
                    fans notified
                  </p>
                  <p className='mt-2 text-xs leading-5 text-tertiary-token'>
                    The minute the release is live, Jovie starts the outreach
                    for you.
                  </p>
                </div>

                <div className='rounded-[0.9rem] border border-subtle bg-surface-1 p-4'>
                  <div className='flex items-start gap-3'>
                    <span className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300'>
                      <Mail className='h-4 w-4' />
                    </span>
                    <div className='min-w-0'>
                      <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                        Release email
                      </p>
                      <p className='mt-1 text-sm font-medium text-primary-token'>
                        New release from Tim White
                      </p>
                      <p className='mt-1 text-sm leading-6 text-secondary-token'>
                        {activeRelease.title} is out now. Fans already have the
                        smart link in their inbox.
                      </p>
                      <div className='mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-300'>
                        <CheckCheck className='h-3 w-3' />
                        Sent automatically by Jovie
                      </div>
                    </div>
                  </div>
                </div>

                <div className='hidden overflow-hidden rounded-[0.9rem] border border-subtle bg-surface-1 p-3 lg:block'>
                  <div className='mx-auto origin-top scale-[0.58] xl:scale-[0.66]'>
                    <ReleasePhone release={activeRelease} />
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
