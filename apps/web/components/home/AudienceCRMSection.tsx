'use client';

import { DollarSign, Mail, MapPin, Users } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Container } from '@/components/site/Container';

const DemoAudienceSection = lazy(
  () => import('@/components/demo/DemoAudienceSection')
);

/* ------------------------------------------------------------------ */
/*  Stat cards shown above the table                                    */
/* ------------------------------------------------------------------ */

const STATS = [
  { label: 'Total fans', value: '2,847', icon: Users },
  { label: 'Email subscribers', value: '2,341', icon: Mail },
  { label: 'Cities reached', value: '189', icon: MapPin },
  { label: 'Tips earned', value: '$1,204', icon: DollarSign },
];
const BENEFITS = [
  'See who clicked',
  'Know where they came from',
  'Re-engage high-intent fans',
] as const;

/* ------------------------------------------------------------------ */
/*  Loading skeleton (matches old FansTable layout)                     */
/* ------------------------------------------------------------------ */

function TableSkeleton() {
  return (
    <div className='animate-pulse bg-[var(--linear-bg-surface-0)]'>
      {/* Table header skeleton */}
      <div className='flex items-center justify-between border-b border-[var(--linear-border-subtle)] px-5 py-3'>
        <div className='flex items-center gap-2'>
          <div className='h-4 w-24 rounded bg-[var(--linear-bg-surface-2)]' />
          <div className='h-4 w-8 rounded-full bg-[var(--linear-bg-surface-2)]' />
        </div>
        <div className='h-4 w-16 rounded bg-[var(--linear-bg-surface-2)]' />
      </div>

      {/* Column headers skeleton */}
      <div className='flex items-center gap-4 border-b border-[var(--linear-border-subtle)] px-5 py-2'>
        {[
          { key: 'col-name', width: 'w-16' },
          { key: 'col-city', width: 'w-12' },
          { key: 'col-source', width: 'w-16' },
          { key: 'col-date', width: 'w-14' },
          { key: 'col-status', width: 'w-20' },
          { key: 'col-tips', width: 'w-10' },
        ].map(({ key, width }) => (
          <div
            key={key}
            className={`h-3 ${width} rounded bg-[var(--linear-bg-surface-2)]`}
          />
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
            <div className='h-3.5 w-28 rounded bg-[var(--linear-bg-surface-2)]' />
            <div className='h-3 w-40 rounded bg-[var(--linear-bg-surface-2)] opacity-50' />
          </div>
          <div className='h-3 w-14 rounded bg-[var(--linear-bg-surface-2)]' />
          <div className='h-3 w-10 rounded bg-[var(--linear-bg-surface-2)]' />
          <div className='h-5 w-16 rounded-full bg-[var(--linear-bg-surface-2)]' />
          <div className='h-3 w-24 rounded bg-[var(--linear-bg-surface-2)]' />
          <div className='h-5 w-12 rounded-full bg-[var(--linear-bg-surface-2)]' />
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
    <section className='section-spacing-linear relative overflow-hidden bg-[var(--linear-bg-page)]'>
      {/* Ambient glow behind the mockup */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/4'
        style={{
          width: '700px',
          height: '500px',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, oklch(18% 0.015 260 / 0.2), transparent 65%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          {/* Header */}
          <div className='grid md:grid-cols-2 md:items-start section-gap-linear'>
            <h2 className='max-w-md marketing-h2-linear text-[var(--linear-text-primary)] reveal-on-scroll'>
              Know every fan by name.
            </h2>
            <div className='max-w-lg reveal-on-scroll' data-delay='80'>
              <p className='marketing-lead-linear text-[var(--linear-text-secondary)]'>
                Most profile traffic disappears into Spotify, Instagram, and
                ticketing pages. Jovie captures emails, source, city, and intent
                so you can follow up later.
              </p>
              <span className='mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-[-0.01em] text-[var(--linear-text-tertiary)] border border-[var(--linear-border-subtle)]'>
                Built-in fan CRM
              </span>
            </div>
          </div>

          <div
            className='mt-8 grid gap-3 sm:grid-cols-3 reveal-on-scroll'
            data-delay='120'
          >
            {BENEFITS.map(benefit => (
              <div
                key={benefit}
                className='rounded-2xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] px-4 py-3 text-sm font-medium text-[var(--linear-text-secondary)]'
              >
                {benefit}
              </div>
            ))}
          </div>

          {/* Product demo */}
          <div
            className='relative mt-16 md:mt-20 mx-auto w-full reveal-on-scroll'
            data-delay='160'
          >
            {/* Dashboard window */}
            <div
              className='relative overflow-hidden rounded-xl md:rounded-2xl'
              style={{
                border: '1px solid var(--linear-border-subtle)',
                backgroundColor: 'var(--linear-bg-surface-0)',
                boxShadow: 'var(--linear-shadow-card-elevated)',
              }}
            >
              {/* Shine border overlay */}
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-0 rounded-xl md:rounded-2xl z-10'
                style={{ border: '1px solid rgba(255,255,255,0.04)' }}
              />
              {/* Mac window chrome */}
              <div className='flex items-center px-5 h-12 border-b border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)]'>
                <div className='flex gap-2'>
                  <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
                  <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
                  <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
                </div>
                <div className='flex-1 text-center text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
                  Audience
                </div>
                <div className='w-[52px]' />
              </div>

              {/* Stat cards */}
              <div className='grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--linear-border-subtle)]'>
                {STATS.map(stat => (
                  <div
                    key={stat.label}
                    className='flex items-center gap-3 px-5 py-4 bg-[var(--linear-bg-surface-0)]'
                  >
                    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--linear-bg-surface-2)]'>
                      <stat.icon
                        className='h-4 w-4 text-[var(--linear-text-secondary)]'
                        aria-hidden='true'
                      />
                    </div>
                    <div className='min-w-0'>
                      <p className='text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
                        {stat.label}
                      </p>
                      <p className='text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
                        {stat.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className='text-xs text-white/50 mt-2 text-center'>
                Real data from a Jovie artist profile
              </p>

              <div className='flex flex-wrap items-center gap-2 border-t border-[var(--linear-border-subtle)] px-5 py-3 text-xs text-[var(--linear-text-tertiary)]'>
                <span className='rounded-full border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] px-2.5 py-1 font-medium text-[var(--linear-text-secondary)]'>
                  Captured from profile
                </span>
                <span className='rounded-full border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] px-2.5 py-1'>
                  Source tracked
                </span>
                <span className='rounded-full border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] px-2.5 py-1'>
                  High-intent fan scoring
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
