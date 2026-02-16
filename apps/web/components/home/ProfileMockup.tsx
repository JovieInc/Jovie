'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const RELEASES = [
  {
    title: 'Signals',
    type: 'Album',
    meta: 'Feb 2022 · 12 tracks',
    color: '#6366f1',
  },
  {
    title: 'Where It Goes',
    type: 'Single',
    meta: 'Jun 2020',
    color: '#f59e0b',
  },
  {
    title: 'Fading Light',
    type: 'EP',
    meta: 'Nov 2019 · 5 tracks',
    color: '#ec4899',
  },
];

const CTA_INTERVAL = 5000;

export function ProfileMockup() {
  const [isListen, setIsListen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const progressPercent = useRef(0);

  // Check reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resetProgressBar = useCallback(() => {
    const el = barRef.current;
    if (!el || prefersReducedMotion) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = `ctaFill ${CTA_INTERVAL}ms linear forwards`;
    progressPercent.current = 0;
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    resetProgressBar();
    const id = setInterval(() => {
      setIsListen(prev => !prev);
    }, CTA_INTERVAL);
    return () => clearInterval(id);
  }, [resetProgressBar, prefersReducedMotion]);

  useEffect(() => {
    if (!prefersReducedMotion) resetProgressBar();
  }, [isListen, resetProgressBar, prefersReducedMotion]);

  return (
    <figure
      aria-label='Profile preview showing adaptive CTA behavior'
      className='rounded-xl overflow-hidden border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] font-sans'
    >
      <style>{`
        @keyframes ctaFill {
          from { width: 0%; }
          to { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cta-progress { animation: none !important; width: 100% !important; }
        }
      `}</style>

      {/* Browser chrome */}
      <div className='flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--linear-border-subtle)]'>
        <div className='flex gap-[5px]'>
          <span className='w-2 h-2 rounded-full bg-[#2a2a2a]' />
          <span className='w-2 h-2 rounded-full bg-[#2a2a2a]' />
          <span className='w-2 h-2 rounded-full bg-[#2a2a2a]' />
        </div>
        <div className='flex-1 text-center text-xs text-[var(--linear-text-tertiary)]'>
          jov.ie/tim
        </div>
      </div>

      {/* Profile content */}
      <div className='px-5 pt-6 pb-5'>
        {/* Avatar + info */}
        <div className='flex items-center gap-3.5 mb-5'>
          <div
            className='w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold text-[var(--linear-text-primary)] shrink-0'
            style={{ background: 'linear-gradient(135deg, #2a1f3d, #1a1a2e)' }}
            aria-hidden='true'
          >
            T
          </div>
          <div>
            <div className='text-base font-semibold text-[var(--linear-text-primary)] mb-0.5'>
              Tim White
            </div>
            <div className='text-[13px] text-[var(--linear-text-tertiary)]'>
              Indie / Alternative · Los Angeles
            </div>
          </div>
        </div>

        {/* Releases */}
        <div className='flex flex-col gap-2.5 mb-5'>
          {RELEASES.map(release => (
            <div key={release.title} className='flex items-center gap-3'>
              <div
                className='w-10 h-10 rounded-md shrink-0 opacity-80'
                style={{ backgroundColor: release.color }}
                aria-hidden='true'
              />
              <div className='min-w-0'>
                <div className='text-[13px] font-medium text-[var(--linear-text-primary)] truncate'>
                  {release.title}
                </div>
                <div className='text-xs text-[var(--linear-text-tertiary)]'>
                  {release.type} · {release.meta}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA area */}
        <div className='relative overflow-hidden rounded-lg'>
          {/* Subscribe CTA */}
          <div
            className='py-2.5 px-3.5 rounded-lg text-[13px] font-medium text-center transition-all duration-500'
            style={{
              opacity: isListen ? 0 : 1,
              transform: isListen ? 'translateY(-8px)' : 'translateY(0)',
              position: isListen ? 'absolute' : 'relative',
              inset: isListen ? 0 : undefined,
              backgroundColor: '#ffffff',
              color: '#111111',
            }}
          >
            Get updates from Tim White
          </div>

          {/* Listen CTA */}
          <div
            className='py-2.5 px-3.5 rounded-lg text-[13px] font-medium text-center transition-all duration-500'
            style={{
              opacity: isListen ? 1 : 0,
              transform: isListen ? 'translateY(0)' : 'translateY(8px)',
              position: isListen ? 'relative' : 'absolute',
              inset: isListen ? undefined : 0,
              backgroundColor: 'rgba(52,211,153,0.08)',
              color: 'rgb(52 211 153)',
              border: '1px solid rgba(52,211,153,0.15)',
            }}
          >
            ▶ Play Signals on Spotify
          </div>

          {/* Progress bar */}
          <div
            ref={barRef}
            role='progressbar'
            aria-valuenow={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label='Time until CTA switches'
            className='cta-progress absolute bottom-0 left-0 h-[3px] opacity-60'
            style={{
              backgroundColor: isListen
                ? 'rgb(52 211 153)'
                : 'var(--linear-text-primary)',
              animation: prefersReducedMotion
                ? 'none'
                : `ctaFill ${CTA_INTERVAL}ms linear forwards`,
            }}
          />
        </div>

        {/* Label */}
        <div className='mt-2 text-center text-[11px] text-[var(--linear-text-tertiary)] transition-opacity duration-500'>
          {isListen
            ? 'Return visitor · preferred streaming platform'
            : 'New visitor · email / sms capture'}
        </div>
      </div>
    </figure>
  );
}
