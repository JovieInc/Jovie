'use client';

import { useEffect, useRef, useState } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileCaptureSectionProps {
  readonly capture: ArtistProfileLandingCopy['capture'];
}

const notificationRows = [
  'New release alert queued',
  'Nearby show reminder ready',
  'Drop update prepared',
] as const;

export function ArtistProfileCaptureSection({
  capture,
}: Readonly<ArtistProfileCaptureSectionProps>) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      entries => {
        setIsActive(entries.some(entry => entry.isIntersecting));
      },
      { threshold: 0.38 }
    );

    observer.observe(section);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <ArtistProfileSectionShell className='min-h-[88svh] bg-white/[0.008]'>
      <div
        ref={sectionRef}
        className='grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center'
      >
        <div>
          <h2 className='text-[clamp(3.5rem,8vw,7.5rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-primary-token'>
            {capture.headline}
          </h2>
          <p className='mt-6 max-w-[34rem] text-[clamp(1.25rem,2vw,1.9rem)] font-medium leading-[1.2] tracking-[-0.04em] text-secondary-token'>
            {capture.subhead}
          </p>
          <p className='mt-5 max-w-[32rem] text-[16px] leading-[1.7] text-secondary-token'>
            {capture.body}
          </p>
        </div>

        <div className='relative mx-auto w-full max-w-[620px]'>
          <div
            className={cn(
              'mx-auto rounded-[2rem] bg-white/[0.035] p-5 transition-all duration-700',
              isActive
                ? 'translate-y-0 opacity-100'
                : 'translate-y-6 opacity-70'
            )}
          >
            <div className='rounded-[1.55rem] bg-black/35 p-5'>
              <div className='flex items-center justify-between gap-4'>
                <div>
                  <p className='text-[13px] font-medium text-primary-token'>
                    Stay close
                  </p>
                  <p className='mt-1 text-[12px] text-secondary-token'>
                    Release, show, and drop alerts
                  </p>
                </div>
                <div
                  className={cn(
                    'rounded-full px-4 py-2 text-[12px] font-medium transition-colors duration-700',
                    isActive
                      ? 'bg-white text-black'
                      : 'bg-white/[0.08] text-secondary-token'
                  )}
                >
                  {isActive ? 'Subscribed' : 'Subscribe'}
                </div>
              </div>

              <div className='mt-8 rounded-[1.25rem] bg-white/[0.04] p-4'>
                <div className='h-2 w-28 rounded-full bg-white/16' />
                <div className='mt-3 h-2 w-44 rounded-full bg-white/10' />
                <div className='mt-3 h-2 w-32 rounded-full bg-white/8' />
              </div>

              <div className='mt-5 space-y-3'>
                {notificationRows.map((row, index) => (
                  <div
                    key={row}
                    className={cn(
                      'flex items-center justify-between rounded-[1rem] bg-white/[0.045] px-4 py-3 transition-all duration-700',
                      isActive
                        ? 'translate-y-0 opacity-100'
                        : 'translate-y-4 opacity-0'
                    )}
                    style={{ transitionDelay: `${180 + index * 140}ms` }}
                  >
                    <span className='text-[13px] text-secondary-token'>
                      {row}
                    </span>
                    <span className='h-2 w-2 rounded-full bg-white/60' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
