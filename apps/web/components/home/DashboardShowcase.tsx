'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import { BrowserChrome } from './demo/BrowserChrome';
import { DashboardAnalyticsDemo } from './demo/DashboardAnalyticsDemo';
import { DashboardAudienceDemo } from './demo/DashboardAudienceDemo';
import { DashboardEarningsDemo } from './demo/DashboardEarningsDemo';
import { DashboardLinksDemo } from './demo/DashboardLinksDemo';
import { DashboardReleasesDemo } from './demo/DashboardReleasesDemo';

const TABS = [
  { key: 'analytics', label: 'Analytics', Component: DashboardAnalyticsDemo },
  { key: 'audience', label: 'Audience', Component: DashboardAudienceDemo },
  { key: 'earnings', label: 'Earnings', Component: DashboardEarningsDemo },
  { key: 'releases', label: 'Releases', Component: DashboardReleasesDemo },
  { key: 'links', label: 'Links', Component: DashboardLinksDemo },
] as const;

const ROTATION_INTERVAL = 6000;

/**
 * DashboardShowcase — a tab-based product demo section for the marketing homepage.
 *
 * Auto-rotates through dashboard views (analytics, audience, earnings, releases, links)
 * with a progress indicator. Manual tab clicks reset the rotation timer.
 * Follows the same patterns as ExampleProfilesCarousel.
 */
export function DashboardShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const resetProgress = useCallback(() => {
    const el = progressRef.current;
    if (!el || prefersReducedMotion) return;
    el.style.animation = 'none';
    el.getClientRects(); // force reflow
    el.style.animation = `showcaseProgress ${ROTATION_INTERVAL}ms linear forwards`;
  }, [prefersReducedMotion]);

  const startAutoRotation = useCallback(() => {
    if (prefersReducedMotion) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % TABS.length);
    }, ROTATION_INTERVAL);
  }, [prefersReducedMotion]);

  // Auto-rotate and reset progress whenever active tab changes
  useEffect(() => {
    resetProgress();
    startAutoRotation();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeIndex, resetProgress, startAutoRotation]);

  const handleTabClick = (index: number) => {
    setActiveIndex(index);
    // Rotation restarts via the useEffect dependency on activeIndex
  };

  const ActiveComponent = TABS[activeIndex].Component;

  return (
    <section
      className='section-spacing-linear'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <style>{`
        @keyframes showcaseProgress {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .showcase-progress { animation: none !important; width: 100% !important; }
        }
      `}</style>

      <Container size='homepage'>
        {/* Section header */}
        <div className='mb-8 text-center'>
          <h2
            className='text-2xl font-semibold sm:text-3xl'
            style={{ color: 'var(--linear-text-primary)' }}
          >
            Your dashboard, powered by data
          </h2>
          <p
            className='mx-auto mt-3 max-w-xl text-base'
            style={{ color: 'var(--linear-text-secondary)' }}
          >
            Track every click, grow your audience, and earn from your fans — all
            in one place.
          </p>
        </div>

        {/* Tabs */}
        <div
          className='mx-auto mb-6 flex max-w-lg justify-center gap-1 rounded-lg p-1'
          style={{ backgroundColor: 'var(--linear-bg-surface-1)' }}
          role='tablist'
        >
          {TABS.map((tab, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                type='button'
                key={tab.key}
                role='tab'
                aria-selected={isActive}
                onClick={() => handleTabClick(i)}
                className='relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors'
                style={{
                  color: isActive
                    ? 'var(--linear-text-primary)'
                    : 'var(--linear-text-tertiary)',
                  backgroundColor: isActive
                    ? 'var(--linear-bg-surface-0)'
                    : 'transparent',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {tab.label}
                {/* Progress bar for active tab */}
                {isActive && !prefersReducedMotion && (
                  <div
                    className='absolute bottom-0 left-0 right-0 mx-auto h-[2px] overflow-hidden rounded-full'
                    style={{ width: '80%' }}
                  >
                    <div
                      ref={progressRef}
                      className='showcase-progress h-full rounded-full'
                      style={{
                        backgroundColor: 'var(--linear-accent)',
                        opacity: 0.6,
                      }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className='mx-auto max-w-3xl'>
          <BrowserChrome title={`jov.ie — ${TABS[activeIndex].label}`}>
            <AnimatePresence mode='wait'>
              <motion.div
                key={TABS[activeIndex].key}
                initial={
                  prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={
                  prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }
                }
                transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
              >
                <ActiveComponent />
              </motion.div>
            </AnimatePresence>
          </BrowserChrome>
        </div>
      </Container>
    </section>
  );
}
