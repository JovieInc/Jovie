'use client';

import Image from 'next/image';
import { useId, useMemo, useState } from 'react';
import { Container } from '@/components/site/Container';

type PillarId = 'streams' | 'merch' | 'tickets';

type PillarConfig = {
  id: PillarId;
  tabLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  fanChip: string;
  metricChip: string;
  actions: readonly string[];
  promotedModuleId: PromotedModuleId;
  accentClassName: string;
};

type PromotedModuleId = 'listen' | 'merch' | 'tickets';

const PROFILE_ARTIST = {
  name: 'Mara Vale',
  handle: '@maravale',
  tagline: 'New single out now. Tour announced.',
} as const;

const PILLARS: readonly PillarConfig[] = [
  {
    id: 'streams',
    tabLabel: 'Drive streams',
    eyebrow: 'Adaptive fan routing',
    title: 'One profile. Optimized for every fan.',
    description: 'Same artist profile. Ordered automatically per fan.',
    fanChip: 'Fan: Spotify-heavy',
    metricChip: 'More stream clicks',
    actions: [
      'Pinned the best-performing streaming link for this fan',
      'Testing listen CTA copy (A/B)',
      'Moved video below listen for higher conversion',
    ],
    promotedModuleId: 'listen',
    accentClassName:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.18),transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.24),transparent_55%)]',
  },
  {
    id: 'merch',
    tabLabel: 'Sell merch',
    eyebrow: 'Adaptive fan routing',
    title: 'One profile. Optimized for every fan.',
    description: 'Same artist profile. Ordered automatically per fan.',
    fanChip: 'Fan: High merch intent',
    metricChip: 'More merch clicks',
    actions: [
      'Featured your highest-converting item for this fan',
      'Pinned merch during peak buying sessions',
      'Testing product image variants (A/B)',
    ],
    promotedModuleId: 'merch',
    accentClassName:
      'bg-[radial-gradient(circle_at_70%_25%,rgba(245,158,11,0.12),transparent_60%)] dark:bg-[radial-gradient(circle_at_70%_25%,rgba(245,158,11,0.18),transparent_60%)]',
  },
  {
    id: 'tickets',
    tabLabel: 'Sell tickets',
    eyebrow: 'Adaptive fan routing',
    title: 'One profile. Optimized for every fan.',
    description: 'Same artist profile. Ordered automatically per fan.',
    fanChip: 'Fan: Nearby (Austin)',
    metricChip: 'More ticket clicks',
    actions: [
      'Prioritized the closest upcoming show',
      'Pinned tickets when the fan is near a tour city',
      'Shortened CTA on mobile to reduce drop-off',
    ],
    promotedModuleId: 'tickets',
    accentClassName:
      'bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,0.12),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,0.18),transparent_60%)]',
  },
] as const;

export function ActionDrivenProfileSection() {
  const tabsBaseId = useId();
  const [activePillarId, setActivePillarId] = useState<PillarId>('streams');

  const active = useMemo<PillarConfig>(() => {
    return PILLARS.find(p => p.id === activePillarId) ?? PILLARS[0];
  }, [activePillarId]);

  const getTabId = (pillarId: PillarId): string =>
    `${tabsBaseId}-tab-${pillarId}`;

  const getPanelId = (pillarId: PillarId): string =>
    `${tabsBaseId}-panel-${pillarId}`;

  const activePillarIndex = useMemo<number>(() => {
    const index = PILLARS.findIndex(pillar => pillar.id === activePillarId);
    return index >= 0 ? index : 0;
  }, [activePillarId]);

  return (
    <section className='relative py-16 sm:py-20 bg-base overflow-hidden'>
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 grid-bg opacity-60' />
        <div className={`absolute inset-0 ${active.accentClassName}`} />
        <div className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-base to-transparent dark:from-base' />
        <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
      </div>

      <Container>
        <div className='mx-auto max-w-5xl'>
          <div className='grid gap-10 md:grid-cols-12 md:items-start'>
            <div className='md:col-span-8'>
              <p className='inline-flex w-fit items-center rounded-full border border-subtle bg-surface-1/75 px-2.5 py-1 text-[10px] font-medium tracking-wide uppercase text-secondary-token backdrop-blur supports-backdrop-filter:bg-surface-1/60'>
                {active.eyebrow}
              </p>

              <h2 className='mt-3 text-3xl sm:text-4xl font-medium tracking-tight text-primary-token'>
                {active.title}
              </h2>

              <p className='mt-4 max-w-prose text-sm sm:text-base leading-relaxed text-secondary-token'>
                {active.description}
              </p>

              <div className='mt-6'>
                <div
                  role='tablist'
                  aria-label='Adaptive fan routing'
                  className='relative inline-grid grid-cols-3 rounded-xl border border-subtle bg-surface-0/40 p-1'
                >
                  <span
                    aria-hidden='true'
                    className='absolute inset-y-1 left-1 rounded-lg bg-surface-1 shadow transition-transform duration-500 ease-out motion-reduce:transition-none'
                    style={{
                      width: `calc((100% - 0.5rem) / ${PILLARS.length})`,
                      transform: `translateX(${activePillarIndex * 100}%)`,
                    }}
                  />
                  {PILLARS.map(pillar => {
                    const isActive = pillar.id === activePillarId;
                    const tabId = getTabId(pillar.id);
                    const panelId = getPanelId(pillar.id);

                    return (
                      <button
                        key={pillar.id}
                        type='button'
                        role='tab'
                        id={tabId}
                        aria-selected={isActive}
                        aria-controls={panelId}
                        className={`relative z-10 inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition-colors duration-200 focus-ring-themed motion-reduce:transition-none ${
                          isActive
                            ? 'text-primary-token'
                            : 'text-secondary-token hover:text-primary-token'
                        }`}
                        onClick={() => setActivePillarId(pillar.id)}
                      >
                        {pillar.tabLabel}
                      </button>
                    );
                  })}
                </div>

                <p className='mt-3 text-xs text-tertiary-token'>
                  Same artist profile. Ordered per fan.
                </p>

                <div className='mt-6 rounded-2xl border border-subtle bg-surface-1 p-4'>
                  <div className='text-xs font-medium tracking-wide uppercase text-tertiary-token'>
                    What changes for this fan
                  </div>
                  <div className='mt-3 grid gap-2'>
                    {active.actions.map(action => (
                      <div
                        key={action}
                        className='flex items-start gap-2 rounded-xl border border-subtle/70 bg-surface-0/35 px-3 py-2'
                      >
                        <span className='mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-subtle bg-surface-0 text-[10px] font-semibold text-secondary-token'>
                          ✓
                        </span>
                        <span className='text-sm text-secondary-token leading-snug'>
                          {action}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className='mt-4 flex items-center justify-between gap-3 rounded-xl border border-subtle bg-surface-0/30 px-3 py-2'>
                    <span className='text-xs text-tertiary-token'>Outcome</span>
                    <span className='text-xs font-medium text-secondary-token'>
                      {active.metricChip}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className='md:col-span-4'>
              <div className='rounded-3xl border border-subtle bg-surface-0 p-5 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.55)] dark:shadow-[0_30px_90px_-55px_rgba(0,0,0,0.8)]'>
                {PILLARS.map(pillar => {
                  const isActive = pillar.id === activePillarId;
                  const tabId = getTabId(pillar.id);
                  const panelId = getPanelId(pillar.id);

                  const ctaLabel =
                    pillar.promotedModuleId === 'listen'
                      ? 'Listen'
                      : pillar.promotedModuleId === 'merch'
                        ? 'Shop'
                        : 'Jul 14';

                  return (
                    <div
                      key={pillar.id}
                      id={panelId}
                      role='tabpanel'
                      aria-labelledby={tabId}
                      hidden={!isActive}
                    >
                      <div className='rounded-2xl border border-subtle bg-surface-1 p-4 shadow-[0_10px_35px_-25px_rgba(0,0,0,0.45)] dark:shadow-[0_10px_45px_-30px_rgba(0,0,0,0.75)]'>
                        <div className='flex items-center gap-3'>
                          <div className='h-14 w-14 overflow-hidden rounded-full border border-subtle bg-surface-0 shadow-[0_10px_25px_-20px_rgba(0,0,0,0.55)] dark:shadow-[0_12px_28px_-22px_rgba(0,0,0,0.9)]'>
                            <Image
                              alt='Sample artist avatar'
                              src='/avatars/default-user.png'
                              width={112}
                              height={112}
                              className='h-full w-full object-cover'
                              priority={false}
                            />
                          </div>
                          <div className='min-w-0'>
                            <div className='truncate text-sm font-semibold text-primary-token'>
                              {PROFILE_ARTIST.name}
                            </div>
                            <div className='truncate text-xs text-tertiary-token'>
                              {PROFILE_ARTIST.handle}
                            </div>
                          </div>
                        </div>

                        <button
                          type='button'
                          className='mt-5 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.65)] transition-transform duration-200 btn-press focus-ring-themed motion-reduce:transition-none'
                        >
                          {ctaLabel}
                        </button>

                        <div className='mt-4 rounded-2xl border border-subtle bg-surface-0/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'>
                          <div className='h-3 w-2/3 rounded bg-surface-3/35 dark:bg-surface-2/45' />
                          <div className='mt-3 h-3 w-1/2 rounded bg-surface-3/25 dark:bg-surface-2/35' />
                          <div className='mt-2 h-3 w-3/5 rounded bg-surface-3/25 dark:bg-surface-2/35' />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
