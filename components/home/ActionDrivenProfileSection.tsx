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
  promotedModuleId: ProfileModuleId;
  accentClassName: string;
};

type ProfileModuleId =
  | 'listen'
  | 'merch'
  | 'tickets'
  | 'video'
  | 'newsletter'
  | 'social';

type ProfileModule = {
  id: ProfileModuleId;
  label: string;
  sublabel?: string;
  chip?: string;
};

const PROFILE_ARTIST = {
  name: 'Mara Vale',
  handle: '@maravale',
  tagline: 'New single out now. Tour announced.',
} as const;

const BASE_MODULES: readonly ProfileModule[] = [
  {
    id: 'listen',
    label: 'Listen',
  },
  {
    id: 'merch',
    label: 'Merch',
  },
  {
    id: 'tickets',
    label: 'Tickets',
  },
  {
    id: 'video',
    label: 'Watch',
    sublabel: 'Latest video',
  },
  {
    id: 'newsletter',
    label: 'Text me updates',
    sublabel: 'Direct line',
  },
  {
    id: 'social',
    label: 'Follow',
    sublabel: 'IG / TikTok',
  },
] as const;

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

function reorderModules(
  modules: readonly ProfileModule[],
  promotedModuleId: ProfileModuleId
): ProfileModule[] {
  const promoted = modules.find(m => m.id === promotedModuleId);
  const rest = modules.filter(m => m.id !== promotedModuleId);

  if (!promoted) {
    return [...modules];
  }

  return [promoted, ...rest];
}

export function ActionDrivenProfileSection() {
  const tabsBaseId = useId();
  const [activePillarId, setActivePillarId] = useState<PillarId>('streams');

  const active = useMemo<PillarConfig>(() => {
    return PILLARS.find(p => p.id === activePillarId) ?? PILLARS[0];
  }, [activePillarId]);

  const orderedModules = useMemo<ProfileModule[]>(() => {
    return reorderModules(BASE_MODULES, active.promotedModuleId);
  }, [active.promotedModuleId]);

  const activeTabId = `${tabsBaseId}-tab-${active.id}`;
  const activePanelId = `${tabsBaseId}-panel-${active.id}`;

  const promotedCtaLabel = useMemo<string>(() => {
    switch (active.promotedModuleId) {
      case 'listen':
        return 'Listen';
      case 'merch':
        return 'Shop';
      case 'tickets':
        return 'Jul 14';
      default:
        return 'Open';
    }
  }, [active.promotedModuleId]);

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
            <div className='md:col-span-5'>
              <p className='inline-flex w-fit items-center rounded-full border border-subtle bg-surface-1/75 px-2.5 py-1 text-[10px] font-medium tracking-wide uppercase text-secondary-token backdrop-blur supports-backdrop-filter:bg-surface-1/60'>
                {active.eyebrow}
              </p>

              <h2 className='mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-primary-token'>
                {active.title}
              </h2>

              <p className='mt-4 max-w-prose text-sm sm:text-base leading-relaxed text-secondary-token'>
                {active.description}
              </p>

              <div className='mt-6'>
                <div
                  role='tablist'
                  aria-label='Adaptive fan routing'
                  className='flex flex-wrap gap-2 md:flex-col'
                >
                  {PILLARS.map(pillar => {
                    const isActive = pillar.id === activePillarId;
                    const tabId = `${tabsBaseId}-tab-${pillar.id}`;
                    const panelId = `${tabsBaseId}-panel-${pillar.id}`;
                    return (
                      <button
                        key={pillar.id}
                        type='button'
                        role='tab'
                        id={tabId}
                        aria-selected={isActive}
                        aria-controls={panelId}
                        className={`group inline-flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors duration-150 focus-ring-themed md:w-full ${
                          isActive
                            ? 'border-subtle bg-surface-1 text-primary-token'
                            : 'border-subtle/70 bg-surface-0/40 text-secondary-token hover:text-primary-token hover:bg-surface-1/60'
                        }`}
                        onClick={() => setActivePillarId(pillar.id)}
                      >
                        <span className='min-w-0 truncate'>
                          {pillar.tabLabel}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase transition-colors duration-150 ${
                            isActive
                              ? 'border-subtle bg-surface-0 text-secondary-token'
                              : 'border-subtle/60 bg-surface-0/30 text-tertiary-token group-hover:text-secondary-token'
                          }`}
                        >
                          {pillar.fanChip}
                        </span>
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

            <div className='md:col-span-7'>
              <div
                id={activePanelId}
                role='tabpanel'
                aria-labelledby={activeTabId}
                className='rounded-3xl border border-subtle bg-surface-0 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.55)] dark:shadow-[0_30px_90px_-55px_rgba(0,0,0,0.8)] overflow-hidden'
              >
                <div className='flex items-center justify-between gap-3 border-b border-subtle bg-surface-1 px-4 py-3'>
                  <div className='flex items-center gap-1.5'>
                    <span className='h-2 w-2 rounded-full bg-surface-3' />
                    <span className='h-2 w-2 rounded-full bg-surface-3' />
                    <span className='h-2 w-2 rounded-full bg-surface-3' />
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='inline-flex items-center rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-secondary-token'>
                      {active.fanChip}
                    </span>
                    <span className='inline-flex items-center rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-secondary-token'>
                      {active.metricChip}
                    </span>
                  </div>
                </div>

                <div className='p-5 sm:p-6'>
                  <div className='rounded-2xl border border-subtle bg-surface-1 p-4'>
                    <div className='flex items-center gap-3'>
                      <div className='h-12 w-12 overflow-hidden rounded-full border border-subtle bg-surface-0'>
                        <Image
                          alt='Sample artist avatar'
                          src='/avatars/default-user.png'
                          width={96}
                          height={96}
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

                    <p className='mt-3 text-xs text-secondary-token'>
                      {PROFILE_ARTIST.tagline}
                    </p>

                    <div className='mt-4 grid gap-2'>
                      {orderedModules.map((module, index) => {
                        const isPromoted =
                          module.id === active.promotedModuleId;
                        const isFirst = index === 0;

                        return (
                          <div
                            key={module.id}
                            className={`relative overflow-hidden rounded-xl border px-4 py-3 transition-colors duration-150 ${
                              isPromoted
                                ? 'border-subtle bg-surface-0'
                                : 'border-subtle/70 bg-surface-0/30'
                            }`}
                          >
                            {isPromoted && (
                              <div className='pointer-events-none absolute inset-0 opacity-70'>
                                <div className='absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.14),transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(120,119,198,0.18),transparent_55%)]' />
                              </div>
                            )}

                            <div className='relative flex items-start justify-between gap-3'>
                              <div className='min-w-0'>
                                <div className='flex items-center gap-2'>
                                  <div className='truncate text-sm font-medium text-primary-token'>
                                    {module.label}
                                  </div>
                                  {isPromoted && (
                                    <span className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-secondary-token'>
                                      Auto-pin
                                    </span>
                                  )}
                                  {isFirst && !isPromoted && (
                                    <span className='inline-flex items-center rounded-full border border-subtle/60 bg-surface-1/40 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-tertiary-token'>
                                      Top
                                    </span>
                                  )}
                                </div>
                                {module.sublabel ? (
                                  <div className='mt-1 text-xs text-tertiary-token'>
                                    {module.sublabel}
                                  </div>
                                ) : null}
                              </div>

                              {isPromoted ? (
                                <span className='inline-flex h-8 items-center justify-center rounded-md border border-subtle bg-surface-1 px-3 text-xs font-medium text-secondary-token'>
                                  {promotedCtaLabel}
                                </span>
                              ) : (
                                <span className='inline-flex h-8 items-center justify-center rounded-md border border-subtle/60 bg-surface-1/30 px-3 text-xs font-medium text-tertiary-token'>
                                  —
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
