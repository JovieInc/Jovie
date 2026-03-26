'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '@/components/site/Container';
import {
  MODES,
  type ModeData,
  PhoneShowcase,
} from './phone-showcase-primitives';

const AUTO_ADVANCE_MS = 4000;

function ModePill({
  mode,
  isActive,
  onClick,
}: {
  readonly mode: ModeData;
  readonly isActive: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-all duration-300'
      style={{
        borderColor: isActive
          ? 'var(--linear-border-default)'
          : 'rgba(255,255,255,0.06)',
        backgroundColor: isActive
          ? 'var(--linear-bg-surface-1)'
          : 'transparent',
        color: isActive
          ? 'var(--linear-text-primary)'
          : 'var(--linear-text-tertiary)',
      }}
    >
      {mode.outcome}
    </button>
  );
}

export function UnifiedProfileSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoAdvance = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % MODES.length);
    }, AUTO_ADVANCE_MS);
  }, []);

  useEffect(() => {
    startAutoAdvance();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startAutoAdvance]);

  const handlePillClick = useCallback(
    (index: number) => {
      setActiveIndex(index);
      startAutoAdvance();
    },
    [startAutoAdvance]
  );

  return (
    <section className='section-spacing-linear'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          {/* Intro */}
          <div className='reveal-on-scroll mb-12 max-w-[600px] lg:mb-16'>
            <p className='homepage-section-eyebrow'>Artist Profile</p>
            <h2 className='marketing-h2-linear mt-5 text-primary-token'>
              Profiles that convert.
            </h2>
            <p className='marketing-lead-linear mt-4 text-secondary-token'>
              Streaming links, merch, tips, email capture, and tour dates —
              imported automatically and updated with every release.
            </p>
          </div>

          {/* Two-column: text + phone */}
          <div
            className='reveal-on-scroll grid items-center gap-10 lg:grid-cols-2 lg:gap-16'
            data-delay='80'
          >
            {/* Left — mode description + pills */}
            <div className='order-2 lg:order-1'>
              {/* Mode pills */}
              <div className='flex flex-wrap gap-2'>
                {MODES.map((mode, i) => (
                  <ModePill
                    key={mode.id}
                    mode={mode}
                    isActive={i === activeIndex}
                    onClick={() => handlePillClick(i)}
                  />
                ))}
              </div>

              {/* Crossfading headline + description */}
              <div className='relative mt-8' style={{ minHeight: '160px' }}>
                {MODES.map((mode, i) => (
                  <div
                    key={mode.id}
                    className='transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
                    style={{
                      opacity: i === activeIndex ? 1 : 0,
                      position: i === activeIndex ? 'relative' : 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      pointerEvents: i === activeIndex ? 'auto' : 'none',
                    }}
                    aria-hidden={i !== activeIndex}
                  >
                    <h3 className='text-xl font-semibold tracking-tight text-primary-token lg:text-2xl'>
                      {mode.headline}
                    </h3>
                    <p className='mt-3 text-[15px] leading-[1.6] text-secondary-token'>
                      {mode.description}
                    </p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className='mt-6 flex gap-1.5'>
                {MODES.map((mode, i) => (
                  <div
                    key={mode.id}
                    className='h-[2px] flex-1 overflow-hidden rounded-full'
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                  >
                    <div
                      className='h-full rounded-full'
                      style={{
                        backgroundColor:
                          i <= activeIndex
                            ? 'var(--linear-text-tertiary)'
                            : 'transparent',
                        width:
                          i < activeIndex
                            ? '100%'
                            : i === activeIndex
                              ? '100%'
                              : '0%',
                        transition:
                          i === activeIndex
                            ? `width ${AUTO_ADVANCE_MS}ms linear`
                            : 'none',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Right — phone */}
            <div className='order-1 flex justify-center lg:order-2'>
              <div className='w-[280px]'>
                <PhoneShowcase activeIndex={activeIndex} modes={MODES} />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
