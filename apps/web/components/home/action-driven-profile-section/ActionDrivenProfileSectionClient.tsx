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
    <section
      className='relative section-spacing-linear overflow-hidden'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <div className='absolute inset-0 -z-10'>
        <div className='absolute inset-0 grid-bg opacity-60' />
        <div className={`absolute inset-0 ${active.accentClassName}`} />
        <div className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-[var(--linear-bg-page)] to-transparent' />
        <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[var(--linear-bg-page)] to-transparent' />
      </div>

      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          <div className='grid md:grid-cols-12 md:items-start section-gap-linear'>
            <div className='md:col-span-8'>
              <p className='inline-flex w-fit items-center rounded-full border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] px-2.5 py-1 text-[10px] font-medium tracking-wide uppercase text-[var(--linear-text-secondary)] backdrop-blur'>
                {active.eyebrow}
              </p>

              <h2 className='mt-4 marketing-h2-linear text-[var(--linear-text-primary)]'>
                {active.title}
              </h2>

              <p className='mt-4 max-w-prose marketing-lead-linear text-[var(--linear-text-secondary)]'>
                {active.description}
              </p>

              <div className='mt-8'>
                <div
                  role='tablist'
                  aria-label='Adaptive fan routing'
                  className='relative inline-grid grid-cols-3 rounded-xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] p-1'
                >
                  <span
                    aria-hidden='true'
                    className='absolute inset-y-1 left-1 rounded-lg bg-[var(--linear-bg-surface-2)] shadow-sm transition-transform duration-300 ease-out'
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
                        className={`relative z-10 inline-flex items-center justify-center rounded-lg px-4 py-2 text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] transition-colors duration-200 focus-ring ${
                          isActive
                            ? 'text-[var(--linear-text-primary)]'
                            : 'text-[var(--linear-text-tertiary)] hover:text-[var(--linear-text-primary)] hover:bg-[var(--linear-bg-hover)]'
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

                <p className='mt-3 text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
                  Same artist profile. Ordered per fan.
                </p>

                <div className='mt-8 rounded-2xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] p-5'>
                  <div className='text-[var(--linear-label-size)] font-medium tracking-wide uppercase text-[var(--linear-text-tertiary)]'>
                    What changes for this fan
                  </div>
                  <div className="relative mt-4 overflow-hidden rounded-xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] before:absolute before:bottom-4 before:left-[26px] before:top-4 before:w-px before:bg-[var(--linear-border-subtle)] before:content-['']">
                    {active.actions.map(action => (
                      <div
                        key={action}
                        className='relative border-b border-[var(--linear-border-subtle)] py-3 pl-12 pr-4 last:border-b-0 hover:bg-[var(--linear-bg-hover)] transition-colors'
                      >
                        <span className='absolute left-4 top-3 inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--linear-border-strong)] bg-[var(--linear-bg-surface-2)] text-[11px] font-semibold text-[var(--linear-text-tertiary)]'>
                          ✓
                        </span>
                        <span className='text-[var(--linear-body-sm-size)] leading-snug text-[var(--linear-text-secondary)]'>
                          {action}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className='mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] px-4 py-3'>
                    <span className='text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
                      Outcome
                    </span>
                    <span className='text-[var(--linear-caption-size)] font-medium text-[var(--linear-text-secondary)]'>
                      {active.metricChip}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className='md:col-span-4'>
              <div
                className='rounded-[24px] border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] p-5'
                style={{ boxShadow: 'var(--linear-shadow-card-elevated)' }}
              >
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
                      <div
                        className='rounded-2xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] p-4'
                        style={{ boxShadow: 'var(--linear-shadow-card)' }}
                      >
                        <div className='flex items-center gap-3'>
                          <div className='h-14 w-14 overflow-hidden rounded-full border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)]'>
                            <Image
                              alt='Sample artist avatar'
                              src='/avatars/default-user.png'
                              width={112}
                              height={112}
                              sizes='56px'
                              className='h-full w-full object-cover'
                              priority={false}
                            />
                          </div>
                          <div className='min-w-0'>
                            <div className='truncate text-[var(--linear-body-sm-size)] font-[var(--linear-font-weight-semibold)] text-[var(--linear-text-primary)]'>
                              {profileArtist.name}
                            </div>
                            <div className='truncate text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
                              {profileArtist.handle}
                            </div>
                          </div>
                        </div>

                        <button
                          type='button'
                          className='mt-5 w-full rounded-xl bg-[var(--linear-text-primary)] px-4 py-3 text-[var(--linear-body-sm-size)] font-semibold text-[var(--linear-bg-page)] transition-transform duration-200 focus-ring hover:scale-[1.02]'
                        >
                          {ctaLabel}
                        </button>

                        <div className='mt-4 rounded-2xl border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] p-4'>
                          <div className='h-3 w-2/3 rounded bg-[var(--linear-bg-surface-2)]' />
                          <div className='mt-3 h-3 w-1/2 rounded bg-[var(--linear-bg-surface-2)]' />
                          <div className='mt-2 h-3 w-3/5 rounded bg-[var(--linear-bg-surface-2)]' />
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
