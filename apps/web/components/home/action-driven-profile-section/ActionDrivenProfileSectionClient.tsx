'use client';

import Image from 'next/image';
import { Container } from '@/components/site/Container';
import type { ActionDrivenProfileSectionClientProps } from './types';
import { usePillarTabs } from './usePillarTabs';

export function ActionDrivenProfileSectionClient({
  pillars,
  profileArtist,
}: ActionDrivenProfileSectionClientProps) {
  const {
    activePillarId,
    setActivePillarId,
    active,
    activePillarIndex,
    tabRefs,
    getTabId,
    getPanelId,
    handleTabKeyDown,
  } = usePillarTabs({ pillars });

  if (!active) {
    return null;
  }

  return (
    <section className='relative py-16 sm:py-20 bg-base overflow-hidden'>
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 grid-bg opacity-60' />
        <div className={`absolute inset-0 ${active.accentClassName}`} />
        <div className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-base to-transparent dark:from-base' />
        <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
      </div>

      <Container size='md'>
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
                      width: `calc((100% - 0.5rem) / ${pillars.length})`,
                      transform: `translateX(${activePillarIndex * 100}%)`,
                    }}
                  />
                  {pillars.map((pillar, index) => {
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
                        tabIndex={isActive ? 0 : -1}
                        className={`relative z-10 inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition-colors duration-200 focus-ring-themed motion-reduce:transition-none ${
                          isActive
                            ? 'text-primary-token'
                            : 'text-secondary-token hover:text-primary-token'
                        }`}
                        ref={node => {
                          tabRefs.current[index] = node;
                        }}
                        onClick={() => setActivePillarId(pillar.id)}
                        onKeyDown={event => handleTabKeyDown(event, index)}
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
                  <div className="relative mt-3 overflow-hidden rounded-xl border border-subtle bg-surface-0/30 before:absolute before:bottom-3 before:left-[22px] before:top-3 before:w-px before:bg-subtle/70 before:content-['']">
                    {active.actions.map(action => (
                      <div
                        key={action}
                        className='relative border-b border-subtle/70 py-2.5 pl-10 pr-3 last:border-b-0 hover:bg-surface-0/45'
                      >
                        <span className='absolute left-3 top-2.5 inline-flex h-5 w-5 items-center justify-center rounded-md border border-subtle bg-surface-0 text-[11px] font-semibold text-tertiary-token'>
                          ✓
                        </span>
                        <span className='text-sm leading-snug text-secondary-token'>
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
                {pillars.map(pillar => {
                  const isActive = pillar.id === activePillarId;
                  const tabId = getTabId(pillar.id);
                  const panelId = getPanelId(pillar.id);

                  const getCtaLabel = () => {
                    if (pillar.promotedModuleId === 'listen') return 'Listen';
                    if (pillar.promotedModuleId === 'merch') return 'Shop';
                    return 'Jul 14';
                  };
                  const ctaLabel = getCtaLabel();

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
                              {profileArtist.name}
                            </div>
                            <div className='truncate text-xs text-tertiary-token'>
                              {profileArtist.handle}
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
