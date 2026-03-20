'use client';

import { Check, Zap } from 'lucide-react';
import { useState } from 'react';
import { Container } from '@/components/site/Container';
import { DashboardMockup } from './DashboardMockup';
import { PhoneFrame } from './PhoneFrame';
import { ReleasePhoneContent } from './ReleasePhoneContent';
import { RELEASES } from './releases-data';

const RELEASE_PROOF_POINTS = [
  'Catalog sync',
  'Smart links per release',
  'Fan notifications',
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
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
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
            <span className='inline-flex w-fit items-center gap-1.5 rounded-full border border-subtle px-3 py-1 text-xs font-medium tracking-[-0.01em] text-tertiary-token'>
              <Zap className='h-3 w-3' aria-hidden='true' />
              Automatic
            </span>

            <div className='grid gap-5 md:grid-cols-2 md:items-start md:gap-8'>
              <h2 className='marketing-h2-linear text-primary-token'>
                Every release gets a smart link and a built-in launch flow.
              </h2>
              <p className='max-w-md marketing-lead-linear text-secondary-token'>
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
                className='rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-xs font-medium text-secondary-token'
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
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                <Zap
                  className='h-4 w-4 text-secondary-token'
                  aria-hidden='true'
                />
              </div>
              <div>
                <p className='text-sm font-medium text-primary-token'>
                  Launch without rebuilding assets every release.
                </p>
                <p className='text-xs text-tertiary-token'>
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
              <span className='text-xs text-quaternary-token'>
                from your profile
              </span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
