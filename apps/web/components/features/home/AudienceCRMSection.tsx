'use client';

import { Mail, MapPin, Users } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Container } from '@/components/site/Container';

const DemoAudienceSection = lazy(
  () => import('@/features/demo/DemoAudienceSection')
);

/* ------------------------------------------------------------------ */
/*  Stat cards shown above the table                                    */
/* ------------------------------------------------------------------ */

const STATS = [
  { label: 'Total fans', value: '42,891', icon: Users },
  { label: 'Captured contacts', value: '12,318', icon: Mail },
  { label: 'Top city', value: 'Los Angeles', icon: MapPin },
  { label: 'Fan value', value: 'High intent', icon: Users },
];
const BENEFITS = [
  'Spot your super-fans',
  'Track what actually drives clicks',
  'Build campaign-ready audiences',
] as const;

/* ------------------------------------------------------------------ */
/*  Loading skeleton (matches old FansTable layout)                     */
/* ------------------------------------------------------------------ */

function TableSkeleton() {
  return (
    <div className='animate-pulse bg-surface-0'>
      {/* Table header skeleton */}
      <div className='flex items-center justify-between border-b border-subtle px-5 py-3'>
        <div className='flex items-center gap-2'>
          <div className='h-4 w-24 rounded bg-surface-2' />
          <div className='h-4 w-8 rounded-full bg-surface-2' />
        </div>
        <div className='h-4 w-16 rounded bg-surface-2' />
      </div>

      {/* Column headers skeleton */}
      <div className='flex items-center gap-4 border-b border-subtle px-5 py-2'>
        {[
          { key: 'col-name', width: 'w-16' },
          { key: 'col-city', width: 'w-12' },
          { key: 'col-source', width: 'w-16' },
          { key: 'col-date', width: 'w-14' },
          { key: 'col-status', width: 'w-20' },
          { key: 'col-tips', width: 'w-10' },
        ].map(({ key, width }) => (
          <div key={key} className={`h-3 ${width} rounded bg-surface-2`} />
        ))}
      </div>

      {/* Row skeletons */}
      {[
        'skeleton-row-1',
        'skeleton-row-2',
        'skeleton-row-3',
        'skeleton-row-4',
        'skeleton-row-5',
      ].map((rowKey, i) => (
        <div
          key={rowKey}
          className='flex items-center gap-4 px-5 py-3'
          style={{
            borderBottom:
              i < 4 ? '1px solid var(--linear-border-subtle)' : undefined,
          }}
        >
          <div className='flex-1 space-y-1.5'>
            <div className='h-3.5 w-28 rounded bg-surface-2' />
            <div className='h-3 w-40 rounded bg-surface-2 opacity-50' />
          </div>
          <div className='h-3 w-14 rounded bg-surface-2' />
          <div className='h-3 w-10 rounded bg-surface-2' />
          <div className='h-5 w-16 rounded-full bg-surface-2' />
          <div className='h-3 w-24 rounded bg-surface-2' />
          <div className='h-5 w-12 rounded-full bg-surface-2' />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AudienceCRMSection                                                  */
/* ------------------------------------------------------------------ */

export function AudienceCRMSection() {
  return (
    <section
      id='audience-intelligence'
      className='section-spacing-linear relative overflow-hidden bg-page'
    >
      {/* Ambient glow behind the mockup */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/4'
        style={{
          width: '700px',
          height: '500px',
          borderRadius: '50%',
          background: 'var(--linear-crm-glow)',
        }}
      />

      <Container size='homepage'>
        <div className='homepage-section-shell'>
          <div className='homepage-section-intro'>
            <div className='reveal-on-scroll'>
              <span className='homepage-section-eyebrow'>
                Audience intelligence
              </span>
              <h2 className='mt-4 max-w-[10ch] marketing-h2-linear text-primary-token'>
                Know every fan by name.
              </h2>
            </div>
            <div
              className='homepage-section-copy reveal-on-scroll'
              data-delay='80'
            >
              <p className='marketing-lead-linear text-secondary-token'>
                See which fans keep showing up, where they came from, and which
                platforms are actually driving growth before you spend money on
                the next push.
              </p>
            </div>
          </div>

          <div
            className='homepage-section-stack grid gap-2.5 sm:grid-cols-3 reveal-on-scroll'
            data-delay='120'
          >
            {BENEFITS.map(benefit => (
              <div
                key={benefit}
                className='rounded-[0.95rem] border border-subtle bg-surface-0 px-3.5 py-2.5 text-sm font-medium text-secondary-token'
              >
                {benefit}
              </div>
            ))}
          </div>

          {/* Product demo */}
          <div
            className='relative mx-auto mt-6 w-full reveal-on-scroll md:mt-8'
            data-delay='160'
          >
            {/* Dashboard window */}
            <div
              className='relative overflow-hidden rounded-t-[1rem] rounded-b-none md:rounded-t-[1.05rem]'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                boxShadow: 'var(--linear-panel-ring) 0px 0px 0px 1px inset',
              }}
            >
              {/* Shine border overlay */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-0 z-10 rounded-t-[1rem] rounded-b-none md:rounded-t-[1.05rem]'
              />
              {/* Mac window chrome */}
              <div className='flex h-11 items-center border-b border-subtle bg-surface-1 px-4 sm:px-5'>
                <div className='flex gap-2'>
                  <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
                  <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
                  <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
                </div>
                <div className='flex-1 text-center text-[var(--linear-caption-size)] text-tertiary-token'>
                  Audience
                </div>
                <div className='w-[52px]' />
              </div>

              {/* Stat cards */}
              <div className='grid grid-cols-2 gap-px bg-[var(--linear-border-subtle)] md:grid-cols-4'>
                {STATS.map(stat => (
                  <div
                    key={stat.label}
                    className='flex items-center gap-3 bg-surface-0 px-4 py-3.5 sm:px-5 sm:py-4'
                  >
                    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                      <stat.icon
                        className='h-4 w-4 text-secondary-token'
                        aria-hidden='true'
                      />
                    </div>
                    <div className='min-w-0'>
                      <p className='text-[var(--linear-label-size)] text-tertiary-token'>
                        {stat.label}
                      </p>
                      <p className='text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-primary-token'>
                        {stat.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className='mt-2 text-center text-xs text-quaternary-token'>
                Snapshot from a Jovie audience dashboard
              </p>

              <div className='flex flex-wrap items-center gap-2 border-t border-subtle px-4 py-3 text-xs text-tertiary-token sm:px-5'>
                <span className='rounded-full border border-subtle bg-surface-1 px-2.5 py-1 font-medium text-secondary-token'>
                  Source tracked
                </span>
                <span className='rounded-full border border-subtle bg-surface-1 px-2.5 py-1'>
                  Super-fan segments
                </span>
                <span className='rounded-full border border-subtle bg-surface-1 px-2.5 py-1'>
                  Campaign-ready audiences
                </span>
              </div>

              {/* Real audience table (lazy-loaded, clipped to ~5 visible rows) */}
              <div className='relative max-h-[360px] overflow-hidden'>
                <Suspense fallback={<TableSkeleton />}>
                  <DemoAudienceSection />
                </Suspense>
              </div>

              {/* Bottom gradient fade */}
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-[var(--linear-bg-surface-0)] to-transparent z-20' />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
